import { z } from "zod";
import { getDomain as tldtsGetDomain } from "tldts";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { type OpenSerpHit, type OpenSerpSnapshot } from "@/server/lib/openserp";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import {
  SerpApiError,
  errorForMessage,
  errorForStatus,
  readBounded,
} from "@/server/lib/serpapi-errors";
import {
  DEFAULT_TIMEOUT_MS,
  assertMarket,
  assertSerpApiReady,
  getApiKey,
  getSerpApiDailyRequestLimit,
  getSerpApiLimits,
  normalizeSerpKeyword,
  readInt,
} from "@/server/lib/serpapi-config";
import {
  FEATURE_KEYS,
  isNonEmpty,
  normalizeHostname,
  responseSchema,
} from "@/server/lib/serpapi-parse";

export { SerpApiError, getSerpApiDailyRequestLimit, normalizeSerpKeyword };

/**
 * SerpApi (https://serpapi.com) adapter for rank tracking and SERP features.
 *
 * Mirrors the OpenSERP adapter: the same snapshot shape and the same error
 * codes, so the rank-check workflow records a failure state and never a rank
 * when SerpApi fails. SerpApi's free plan is 250 searches/month and 50/hour,
 * so every search is reserved against account-wide monthly and hourly
 * counters plus a per-project daily counter, and successful results are
 * cached in R2 (a cache hit never uses quota).
 *
 * Env: SERPAPI_API_KEY (secret), SERPAPI_MAX_KEYWORDS_PER_DAY (default 8),
 * SERPAPI_MAX_SEARCHES_PER_MONTH (default 250), SERPAPI_MAX_SEARCHES_PER_HOUR
 * (default 50), SERPAPI_PAGES_PER_KEYWORD (default 1; each page is one
 * search), SERPAPI_TIMEOUT_MS (default 20000).
 */

const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";
const RESULTS_PER_PAGE = 10;
const CACHE_TTL_SECONDS = 6 * 60 * 60;

// Backoff before retry 1 and 2 for transient failures (network error, 5xx,
// one retry for a timeout). Quota/auth/rate-limit/invalid errors never retry.
const DEFAULT_RETRY_DELAYS_MS = [400, 1200];

const snapshotCacheSchema = z.object({
  fetchedAt: z.string(),
  pagesFetched: z.number().int().positive(),
  results: z.array(
    z.object({
      sourceId: z.string().optional(),
      organicRank: z.number().int().positive(),
      absolutePosition: z.number().int().nullable(),
      title: z.string(),
      url: z.string(),
      hostname: z.string(),
      registrableDomain: z.string().nullable(),
      snippet: z.string(),
    }),
  ),
  serpFeatures: z.array(z.string()),
  requestId: z.string().optional(),
});

const inflight = new Map<string, Promise<OpenSerpSnapshot>>();

/**
 * One keyword -> one SerpApi snapshot. Order: validate input and config,
 * answer from cache (no quota), join an identical in-flight search (no quota),
 * reserve quota per page, call SerpApi with bounded retries. A reservation is
 * returned when SerpApi demonstrably did not bill the search (config/auth
 * errors, HTTP errors, unreachable); timeouts keep it because the search may
 * have been billed.
 */
export async function searchSerpApi(input: {
  projectId: string;
  keyword: string;
  region: string;
  lang: string;
  limit: number;
  locationName?: string | null;
  /** Test hook: backoff delays between retries. */
  retryDelaysMs?: number[];
}): Promise<OpenSerpSnapshot> {
  await assertSerpApiReady({ locationName: input.locationName });
  const keyword = normalizeSerpKeyword(input.keyword);
  assertMarket(input.region, input.lang);
  const pagesWanted = Math.min(
    Math.ceil(Math.max(1, input.limit) / RESULTS_PER_PAGE),
    await readInt("SERPAPI_PAGES_PER_KEYWORD", 1, 1, 10),
  );
  const gl = input.region.toLowerCase();
  const hl = input.lang.toLowerCase();
  const cacheKey = await buildCacheKey("serp:serpapi", {
    keyword: keyword.toLowerCase(),
    gl,
    hl,
  });
  const request = { ...input, keyword };
  const cached = snapshotCacheSchema.safeParse(
    // A corrupt or unreadable cache entry is a miss, never an error.
    await getCached(cacheKey).catch(() => null),
  );
  if (
    cached.success &&
    cached.data.pagesFetched >= pagesWanted &&
    cached.data.results.length > 0
  ) {
    return toSnapshot(request, {
      fetchedAt: cached.data.fetchedAt,
      results: cached.data.results.slice(0, input.limit),
      serpFeatures: cached.data.serpFeatures,
      requestId: cached.data.requestId,
      depthFetched: cached.data.pagesFetched * RESULTS_PER_PAGE,
    });
  }

  const flightKey = `${cacheKey}:${pagesWanted}`;
  const running = inflight.get(flightKey);
  if (running) {
    const shared = await running;
    return { ...shared, results: shared.results.slice(0, input.limit) };
  }
  const flight = fetchAndCache(request, {
    cacheKey,
    pagesWanted,
    gl,
    hl,
  }).finally(() => inflight.delete(flightKey));
  inflight.set(flightKey, flight);
  return flight;
}

async function fetchAndCache(
  input: {
    projectId: string;
    keyword: string;
    region: string;
    lang: string;
    limit: number;
    retryDelaysMs?: number[];
  },
  ctx: { cacheKey: string; pagesWanted: number; gl: string; hl: string },
): Promise<OpenSerpSnapshot> {
  const apiKey = await getApiKey();
  const limits = await getSerpApiLimits();
  const hits: OpenSerpHit[] = [];
  const features = new Set<string>();
  let requestId: string | undefined;
  for (let page = 0; page < ctx.pagesWanted; page++) {
    const reservation = await RankTrackingRepository.reserveSerpApiRequest(
      input.projectId,
      limits,
    );
    if (!reservation.ok) {
      throw new SerpApiError(
        "quota_exceeded",
        reservation.reason === "monthly"
          ? "SerpApi monthly search limit reached; no rank was recorded."
          : reservation.reason === "hourly"
            ? "SerpApi hourly search limit reached; no rank was recorded."
            : "SerpApi daily keyword limit reached; no rank was recorded.",
      );
    }
    try {
      const pageResult = await fetchPageWithRetry(
        {
          apiKey,
          keyword: input.keyword,
          gl: ctx.gl,
          hl: ctx.hl,
          start: page * RESULTS_PER_PAGE,
          baseRank: hits.length,
        },
        input.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS,
      );
      hits.push(...pageResult.hits);
      for (const feature of pageResult.features) features.add(feature);
      requestId ??= pageResult.requestId;
      if (pageResult.hits.length < RESULTS_PER_PAGE) break;
    } catch (error) {
      const maybeBilled =
        error instanceof SerpApiError &&
        (error.code === "timeout" ||
          error.code === "no_results_unverified" ||
          error.code === "invalid_response");
      if (!maybeBilled) {
        await RankTrackingRepository.releaseSerpApiRequest(
          input.projectId,
          reservation.keys,
        ).catch(() => undefined);
      }
      // A later page failing must not yield a partial list that looks like a
      // complete top-N: surface the error, record no rank.
      throw error;
    }
  }
  const fetchedAt = new Date().toISOString();
  const serpFeatures = [...features];
  await setCached(
    ctx.cacheKey,
    {
      fetchedAt,
      pagesFetched: ctx.pagesWanted,
      results: hits,
      serpFeatures,
      requestId,
    },
    CACHE_TTL_SECONDS,
  ).catch(() => undefined);
  return toSnapshot(input, {
    fetchedAt,
    results: hits.slice(0, input.limit),
    serpFeatures,
    requestId,
    depthFetched: ctx.pagesWanted * RESULTS_PER_PAGE,
  });
}

async function fetchPageWithRetry(
  page: Parameters<typeof fetchPage>[0],
  delaysMs: number[],
) {
  let timeouts = 0;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchPage(page);
    } catch (error) {
      if (!(error instanceof SerpApiError) || !error.retryable) throw error;
      if (error.code === "timeout" && ++timeouts > 1) throw error;
      const delay = delaysMs[attempt];
      if (delay === undefined) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

function toSnapshot(
  input: { keyword: string; region: string; lang: string; limit: number },
  found: {
    fetchedAt: string;
    results: OpenSerpHit[];
    serpFeatures: string[];
    requestId: string | undefined;
    depthFetched: number;
  },
): OpenSerpSnapshot {
  const { fetchedAt, results, serpFeatures, requestId, depthFetched } = found;
  return {
    provider: "serpapi",
    keyword: input.keyword,
    region: input.region,
    lang: input.lang,
    fetchedAt,
    requestId,
    results,
    serpFeatures,
    // Honest depth: SerpApi returned this many results, not the requested N.
    limitRequested: Math.min(input.limit, depthFetched),
    resultsReturned: results.length,
  };
}

async function fetchPage(input: {
  apiKey: string;
  keyword: string;
  gl: string;
  hl: string;
  start: number;
  baseRank: number;
}): Promise<{ hits: OpenSerpHit[]; features: string[]; requestId?: string }> {
  const timeoutMs = await readInt(
    "SERPAPI_TIMEOUT_MS",
    DEFAULT_TIMEOUT_MS,
    100,
    60_000,
  );
  const url = new URL(SERPAPI_ENDPOINT);
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", input.keyword);
  url.searchParams.set("gl", input.gl);
  url.searchParams.set("hl", input.hl);
  url.searchParams.set("device", "desktop");
  if (input.start > 0) url.searchParams.set("start", String(input.start));
  url.searchParams.set("output", "json");
  // The key is part of the query string (SerpApi has no header option), so
  // this URL is never logged or put in an error message.
  url.searchParams.set("api_key", input.apiKey);

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      throw new SerpApiError(
        "timeout",
        "SerpApi request timed out; no rank was recorded.",
        undefined,
        true,
      );
    }
    throw new SerpApiError(
      "upstream_error",
      "SerpApi could not be reached; no rank was recorded.",
      undefined,
      true,
    );
  }

  let text: string;
  try {
    text = await readBounded(response);
  } catch (error) {
    if (error instanceof SerpApiError) throw error;
    throw new SerpApiError(
      "upstream_error",
      "SerpApi connection dropped; no rank was recorded.",
      undefined,
      true,
    );
  }
  let payload: unknown = null;
  try {
    payload = JSON.parse(text);
  } catch {
    // handled below by status
  }
  const parsed = responseSchema.safeParse(payload);
  const apiMessage = parsed.success ? (parsed.data.error ?? "") : "";

  if (!response.ok) {
    throw errorForStatus(response, apiMessage);
  }
  if (!parsed.success) {
    throw new SerpApiError(
      "invalid_response",
      "SerpApi returned an unexpected response; no rank was recorded.",
    );
  }
  const data = parsed.data;
  const requestId = data.search_metadata?.id;
  if (data.error) {
    if (/hasn't returned any results|no results/i.test(data.error)) {
      throw new SerpApiError(
        "no_results_unverified",
        "SerpApi returned no results; the rank was not changed.",
        { requestId },
      );
    }
    throw errorForMessage(data.error, undefined, requestId);
  }
  if (data.search_metadata?.status === "Error") {
    throw new SerpApiError(
      "upstream_error",
      "SerpApi could not complete the search; no rank was recorded.",
      { requestId },
    );
  }

  const organic = data.organic_results ?? [];
  if (organic.length === 0) {
    throw new SerpApiError(
      "no_results_unverified",
      "SerpApi returned no organic results; the rank was not changed.",
      { requestId },
    );
  }
  const hits: OpenSerpHit[] = [];
  for (const [index, result] of organic.entries()) {
    let link: URL;
    try {
      link = new URL(result.link ?? "");
    } catch {
      throw new SerpApiError(
        "invalid_response",
        "SerpApi returned an organic result with an invalid URL.",
        { requestId },
      );
    }
    if (link.protocol !== "http:" && link.protocol !== "https:") {
      throw new SerpApiError(
        "invalid_response",
        "SerpApi returned an organic result with an unsupported URL.",
        { requestId },
      );
    }
    const hostname = normalizeHostname(link.hostname);
    const organicRank = input.baseRank + index + 1;
    hits.push({
      sourceId: result.position ? `p${result.position}` : undefined,
      organicRank,
      absolutePosition: null,
      title: result.title ?? "",
      url: link.toString(),
      hostname,
      registrableDomain: tldtsGetDomain(hostname),
      snippet: result.snippet ?? "",
    });
  }
  const features = [
    ...new Set(
      Object.entries(FEATURE_KEYS)
        .filter(([key]) => isNonEmpty(data[key]))
        .map(([, name]) => name),
    ),
  ];
  return { hits, features, requestId };
}
