/**
 * Optional free signals shown next to the owned-site sources:
 *  - Chrome UX Report (real-user Core Web Vitals, origin + URL + history)
 *  - Open PageRank (domain authority in Domain Overview)
 *
 * Both are off until their key is set, never touch DataForSEO, and work with
 * FREE_SOURCES_ONLY=true. Results are cached in R2 (the repo's shared cache)
 * so reloading a page does not spend quota; errors are never cached.
 */
import { waitUntil } from "cloudflare:workers";
import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import {
  CruxError,
  queryCruxHistory,
  queryCruxRecord,
  type CruxTarget,
} from "@/server/lib/free-sources/crux";
import {
  OpenPageRankError,
  lookupOpenPageRank,
  normalizeHostname,
  OPEN_PAGERANK_REQUESTS_PER_MINUTE,
} from "@/server/lib/free-sources/open-pagerank";
import { projectWebsiteUrlFromDomain } from "@/server/lib/free-sources/project-url";
import { safeErrorMessage } from "@/server/lib/free-sources/redact";
import { parseResearchTargetOrThrow } from "@/server/lib/domainUtils";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import { getOptionalEnvValue, getWorkersEnv } from "@/server/lib/runtime-env";
import type {
  CruxFormFactor,
  CruxTargetErrorKind,
  CruxTargetResult,
  CruxVitalsResult,
  OpenPageRankResult,
} from "@/shared/real-user-signals";

/** CrUX publishes once a day: half a day keeps data fresh without waste. */
export const CRUX_CACHE_TTL_SECONDS = 12 * 60 * 60;
/** "Not enough data" can flip when traffic grows, so re-check sooner. */
export const CRUX_NO_DATA_TTL_SECONDS = 6 * 60 * 60;
/** Open PageRank is rebuilt from monthly graph releases. */
export const OPEN_PAGERANK_CACHE_TTL_SECONDS = 24 * 60 * 60;

/** CRUX_API_KEY, falling back to the PageSpeed key (same Google API key). */
export async function getCruxApiKey(): Promise<string | null> {
  const dedicated = (await getOptionalEnvValue("CRUX_API_KEY"))?.trim();
  if (dedicated) return dedicated;
  const shared = (await getOptionalEnvValue("PAGESPEED_API_KEY"))?.trim();
  return shared || null;
}

export async function getOpenPageRankApiKey(): Promise<string | null> {
  const key = (await getOptionalEnvValue("OPEN_PAGERANK_API_KEY"))?.trim();
  return key || null;
}

const recordSummarySchema = z.object({
  metrics: z.record(
    z.string(),
    z.object({
      p75: z.number().nullable(),
      good: z.number().nullable(),
      needsImprovement: z.number().nullable(),
      poor: z.number().nullable(),
    }),
  ),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
});

const cachedCruxTargetSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    target: z.string(),
    record: recordSummarySchema,
    trend: z
      .object({
        dates: z.array(z.string()),
        metrics: z.record(
          z.string(),
          z.object({ p75s: z.array(z.number().nullable()) }),
        ),
      })
      .nullable(),
  }),
  z.object({ status: z.literal("no_data"), target: z.string() }),
]);

function cacheWrite(key: string, value: unknown, ttl: number) {
  // waitUntil, not void: workerd drops unregistered pending I/O once the
  // response is sent, so a fire-and-forget put would never persist.
  waitUntil(
    setCached(key, value, ttl).catch((error) => {
      console.error("free-sources.cache-write failed:", error);
    }),
  );
}

async function loadCruxTarget(input: {
  target: CruxTarget;
  label: string;
  formFactor: CruxFormFactor;
  apiKey: string;
}): Promise<CruxTargetResult> {
  const cacheKey = await buildCacheKey("crux:target", {
    target: input.target,
    formFactor: input.formFactor,
  });
  const cached = cachedCruxTargetSchema.safeParse(
    // An unreadable cache must cost a refetch, never the page.
    await getCached(cacheKey).catch(() => null),
  );
  if (cached.success) return cached.data as CruxTargetResult;

  const [record, trend] = await Promise.all([
    queryCruxRecord({
      target: input.target,
      formFactor: input.formFactor,
      apiKey: input.apiKey,
    }),
    // The trend is a nicety: when it fails the current numbers still show.
    queryCruxHistory({
      target: input.target,
      formFactor: input.formFactor,
      apiKey: input.apiKey,
    }).catch((error) => {
      if (error instanceof CruxError && error.permission) throw error;
      return null;
    }),
  ]);

  if (!record) {
    const result: CruxTargetResult = {
      status: "no_data",
      target: input.label,
    };
    cacheWrite(cacheKey, result, CRUX_NO_DATA_TTL_SECONDS);
    return result;
  }
  const result: CruxTargetResult = {
    status: "ok",
    target: input.label,
    record,
    trend,
  };
  cacheWrite(cacheKey, result, CRUX_CACHE_TTL_SECONDS);
  return result;
}

function cruxTargetErrorKind(error: unknown): CruxTargetErrorKind {
  if (error instanceof CruxError) {
    switch (error.kind) {
      case "rate_limited":
      case "timeout":
      case "invalid_response":
      case "invalid_request":
        return error.kind;
      default:
        return "unavailable";
    }
  }
  return "unavailable";
}

/** Real-user Core Web Vitals for a project's website (origin and homepage URL). */
export async function getCruxVitals(input: {
  domain: string | null | undefined;
  formFactor?: CruxFormFactor;
}): Promise<CruxVitalsResult> {
  const apiKey = await getCruxApiKey();
  if (!apiKey) return { state: "disabled" };

  const websiteUrl = projectWebsiteUrlFromDomain(input.domain);
  if (!websiteUrl) return { state: "no_website" };
  const origin = new URL(websiteUrl).origin;
  const homepage = `${origin}/`;
  const formFactor = input.formFactor ?? "ALL";

  const settle = async (
    target: CruxTarget,
    label: string,
  ): Promise<CruxTargetResult> => {
    try {
      return await loadCruxTarget({ target, label, formFactor, apiKey });
    } catch (error) {
      if (error instanceof CruxError && error.permission) throw error;
      return {
        status: "error",
        target: label,
        message: safeErrorMessage(error, apiKey),
        kind: cruxTargetErrorKind(error),
      };
    }
  };

  try {
    const [originResult, urlResult] = await Promise.all([
      settle({ origin }, origin),
      settle({ url: homepage }, homepage),
    ]);
    return {
      state: "ready",
      formFactor,
      origin: originResult,
      url: urlResult,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof CruxError && error.permission) {
      console.warn(
        `crux: Google refused the key (HTTP ${error.status}); enable the Chrome UX Report API for it or set CRUX_API_KEY.`,
      );
      return { state: "api_not_enabled" };
    }
    throw error;
  }
}

/**
 * Best-effort shared request budget across isolates (KV): Open PageRank allows
 * 60 requests per minute per key. KV writes race, so the in-isolate limiter in
 * the client and the API's own 429 remain the hard stops.
 */
async function reserveMinuteSlot(): Promise<
  { ok: true } | { ok: false; retryAfterSeconds: number }
> {
  const env = (await getWorkersEnv()) as { KV?: KVNamespace } | null;
  const kv = env?.KV;
  if (!kv) return { ok: true };
  const nowMs = Date.now();
  const bucket = Math.floor(nowMs / 60_000);
  const key = `opr-rpm:${bucket}`;
  try {
    const used = Number((await kv.get(key)) ?? "0");
    if (used >= OPEN_PAGERANK_REQUESTS_PER_MINUTE) {
      return {
        ok: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil(((bucket + 1) * 60_000 - nowMs) / 1000),
        ),
      };
    }
    await kv.put(key, String(used + 1), { expirationTtl: 120 });
  } catch (error) {
    console.error("open-pagerank: minute counter failed:", error);
  }
  return { ok: true };
}

const cachedOprSchema = z.object({
  domain: z.string(),
  found: z.boolean(),
  score: z.number().nullable(),
  rank: z.number().nullable(),
  referringDomains: z.number().nullable(),
  host: z
    .object({
      name: z.string(),
      score: z.number().nullable(),
      rank: z.number().nullable(),
    })
    .nullable(),
  asOf: z.string().nullable(),
  fetchedAt: z.string(),
});

/** Open PageRank authority score for the hostname in a Domain Overview search. */
export async function getOpenPageRank(input: {
  domain: string;
}): Promise<OpenPageRankResult> {
  const apiKey = await getOpenPageRankApiKey();
  if (!apiKey) return { state: "disabled" };

  let hostname: string;
  try {
    hostname = normalizeHostname(
      parseResearchTargetOrThrow(input.domain).hostname,
    );
  } catch (error) {
    if (error instanceof AppError) return { state: "invalid_domain" };
    throw error;
  }
  if (!hostname) return { state: "invalid_domain" };

  const toResult = (
    row: z.infer<typeof cachedOprSchema>,
  ): OpenPageRankResult =>
    row.found && row.score != null
      ? {
          state: "ok",
          domain: row.domain,
          score: row.score,
          rank: row.rank,
          referringDomains: row.referringDomains,
          host: row.host,
          asOf: row.asOf,
          fetchedAt: row.fetchedAt,
        }
      : { state: "no_data", domain: hostname };

  const cacheKey = await buildCacheKey("open-pagerank:domain", { hostname });
  const cached = cachedOprSchema.safeParse(await getCached(cacheKey));
  if (cached.success) return toResult(cached.data);

  const slot = await reserveMinuteSlot();
  if (!slot.ok) {
    return {
      state: "rate_limited",
      domain: hostname,
      retryAfterSeconds: slot.retryAfterSeconds,
    };
  }

  try {
    const lookup = await lookupOpenPageRank({ hostnames: [hostname], apiKey });
    const entry = lookup.entries.get(hostname) ?? null;
    const row: z.infer<typeof cachedOprSchema> = {
      domain: entry?.domain ?? hostname,
      found: entry != null && entry.score != null,
      score: entry?.score ?? null,
      rank: entry?.rank ?? null,
      referringDomains: entry?.referringDomains ?? null,
      host: entry?.host && entry.host.name !== entry.domain ? entry.host : null,
      asOf: lookup.asOf,
      fetchedAt: new Date().toISOString(),
    };
    cacheWrite(cacheKey, row, OPEN_PAGERANK_CACHE_TTL_SECONDS);
    return toResult(row);
  } catch (error) {
    if (error instanceof OpenPageRankError) {
      switch (error.kind) {
        case "address":
          return { state: "address_blocked", domain: hostname };
        case "auth":
          return { state: "auth_error", domain: hostname };
        case "rate_limited":
          return {
            state: "rate_limited",
            domain: hostname,
            retryAfterSeconds: error.retryAfterSeconds || 60,
          };
        default:
          return {
            state: "error",
            domain: hostname,
            message: safeErrorMessage(error, apiKey),
          };
      }
    }
    throw error;
  }
}
