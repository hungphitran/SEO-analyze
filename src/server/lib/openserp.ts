/* eslint-disable max-lines -- one provider adapter owns config, transport, and normalization */
import { z } from "zod";
import { getDomain as tldtsGetDomain } from "tldts";
import { isFreeSourcesOnly } from "@/server/lib/free-sources/mode";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { AppError } from "@/server/lib/errors";
import type { RankSourceProvider } from "@/shared/rank-tracking";

const OPEN_SERP_MAX_RESPONSE_BYTES = 2_000_000;
const DEFAULT_TIMEOUT_MS = 15_000;

const openSerpResultSchema = z
  .object({
    id: z.string().optional(),
    type: z.string(),
    title: z.string().nullish(),
    url: z.string().nullish(),
    domain: z.string().nullish(),
    snippet: z.string().nullish(),
    position: z
      .object({ absolute: z.number().int().positive().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

const openSerpEnvelopeSchema = z
  .object({
    query: z.object({ text: z.string() }).passthrough(),
    meta: z
      .object({
        request_id: z.string().optional(),
        engines_failed: z.array(z.string()).optional(),
      })
      .passthrough(),
    results: z.array(openSerpResultSchema),
    serp_features: z
      .array(z.object({ type: z.string().optional() }).passthrough())
      .optional(),
    pagination: z.object({ page: z.number().int().positive() }).passthrough(),
  })
  .passthrough();

export type OpenSerpErrorCode =
  | "configuration_error"
  | "unsupported_targeting"
  | "timeout"
  | "rate_limited"
  | "captcha"
  | "blocked"
  | "upstream_error"
  | "invalid_response"
  | "no_results_unverified"
  | "quota_exceeded"
  | "invalid_input";

export class OpenSerpError extends Error {
  constructor(
    public readonly code: OpenSerpErrorCode,
    message: string,
    public readonly details?: {
      httpStatus?: number;
      requestId?: string;
      retryAfterSeconds?: number;
    },
  ) {
    super(message);
    this.name = "OpenSerpError";
  }
}

export interface OpenSerpHit {
  sourceId?: string;
  organicRank: number;
  absolutePosition: number | null;
  title: string;
  url: string;
  hostname: string;
  registrableDomain: string | null;
  snippet: string;
}

export interface OpenSerpSnapshot {
  provider: "openserp" | "serpapi";
  keyword: string;
  region: string;
  lang: string;
  fetchedAt: string;
  requestId?: string;
  results: OpenSerpHit[];
  serpFeatures: string[];
  limitRequested: number;
  resultsReturned: number;
}

type OpenSerpConfig = {
  url: string;
  timeoutMs: number;
  authToken?: string;
};

export type SerpSourceProvider = RankSourceProvider;

/**
 * Which free SERP provider the operator selected, or null. SerpApi needs
 * only SERP_PROVIDER=serpapi plus SERPAPI_API_KEY; with no key it stays off
 * (never a half-configured provider). OpenSERP also needs OPENSERP_ENABLED.
 */
async function selectedFreeSerpProvider(): Promise<
  "openserp" | "serpapi" | null
> {
  const [provider, enabled, serpApiKey] = await Promise.all([
    getOptionalEnvValue("SERP_PROVIDER"),
    getOptionalEnvValue("OPENSERP_ENABLED"),
    getOptionalEnvValue("SERPAPI_API_KEY"),
  ]);
  const name = provider?.trim().toLowerCase();
  if (name === "openserp" && enabled === "true") return "openserp";
  if (name === "serpapi" && serpApiKey?.trim()) return "serpapi";
  return null;
}

export async function resolveSerpProvider(): Promise<SerpSourceProvider> {
  const selected = await selectedFreeSerpProvider();
  if (selected) return selected;
  if (await isFreeSourcesOnly()) {
    throw new AppError(
      "FREE_SOURCES_ONLY",
      "Set SERP_PROVIDER=openserp and OPENSERP_ENABLED=true, or SERP_PROVIDER=serpapi and SERPAPI_API_KEY, to get SERP data in free-sources mode.",
    );
  }
  return "dataforseo";
}

/**
 * True when any free SERP provider (OpenSERP or SerpApi) is selected and
 * usable. The name is kept for the many callers that only need "free SERP
 * path on".
 */
export async function isOpenSerpSelected(): Promise<boolean> {
  return (await selectedFreeSerpProvider()) !== null;
}

export async function getOpenSerpDailyRequestLimit(): Promise<number> {
  const configured = await getOptionalEnvValue("OPENSERP_MAX_KEYWORDS_PER_DAY");
  const limit = configured ? Number(configured) : 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new OpenSerpError(
      "configuration_error",
      "OPENSERP_MAX_KEYWORDS_PER_DAY must be an integer from 1 to 1000.",
    );
  }
  return limit;
}

export async function assertOpenSerpReady(input: {
  locationName?: string | null;
}): Promise<void> {
  await validateOpenSerpRequest(input.locationName);
}

export async function searchOpenSerp(input: {
  keyword: string;
  region: string;
  lang: string;
  limit: number;
  locationName?: string | null;
}): Promise<OpenSerpSnapshot> {
  const config = await validateOpenSerpRequest(input.locationName);
  const requestUrl = new URL("google/search", withTrailingSlash(config.url));
  requestUrl.searchParams.set("text", input.keyword);
  requestUrl.searchParams.set("region", input.region);
  requestUrl.searchParams.set("lang", input.lang);
  requestUrl.searchParams.set(
    "limit",
    String(Math.min(100, Math.max(1, input.limit))),
  );
  requestUrl.searchParams.set("format", "json");
  requestUrl.searchParams.set("extract", "0");
  requestUrl.searchParams.set("features", "true");

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      headers: authHeaders(config),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new OpenSerpError("timeout", "OpenSERP request timed out.");
    }
    throw new OpenSerpError("upstream_error", "OpenSERP could not be reached.");
  }

  const requestId = response.headers.get("x-request-id") ?? undefined;
  if (!response.ok) {
    const code = await errorCodeForResponse(response);
    throw new OpenSerpError(code, openSerpErrorMessage(code), {
      httpStatus: response.status,
      requestId,
      retryAfterSeconds: parseRetryAfter(response.headers.get("retry-after")),
    });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await readBoundedBody(response));
  } catch (error) {
    if (error instanceof OpenSerpError) throw error;
    throw new OpenSerpError(
      "invalid_response",
      "OpenSERP returned invalid JSON.",
    );
  }

  const parsed = openSerpEnvelopeSchema.safeParse(payload);
  if (!parsed.success) {
    throw new OpenSerpError(
      "invalid_response",
      "OpenSERP returned an unexpected response.",
      { requestId },
    );
  }
  const data = parsed.data;
  if (data.meta.engines_failed?.includes("google")) {
    throw new OpenSerpError(
      "upstream_error",
      "OpenSERP could not search Google.",
      {
        requestId: data.meta.request_id ?? requestId,
      },
    );
  }
  if (data.results.length === 0) {
    throw new OpenSerpError(
      "no_results_unverified",
      "OpenSERP returned no results; the rank was not changed.",
      { requestId: data.meta.request_id ?? requestId },
    );
  }

  let organicRank = 0;
  const results: OpenSerpHit[] = [];
  for (const result of data.results) {
    if (result.type !== "organic") continue;
    organicRank++;
    const urlValue = result.url ?? "";
    let url: URL;
    try {
      url = new URL(urlValue);
    } catch {
      throw new OpenSerpError(
        "invalid_response",
        "OpenSERP returned an organic result with an invalid URL.",
        { requestId: data.meta.request_id ?? requestId },
      );
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new OpenSerpError(
        "invalid_response",
        "OpenSERP returned an organic result with an unsupported URL.",
        { requestId: data.meta.request_id ?? requestId },
      );
    }
    const hostname = normalizeHostname(url.hostname);
    results.push({
      sourceId: result.id,
      organicRank,
      absolutePosition: result.position?.absolute ?? null,
      title: result.title ?? "",
      url: url.toString(),
      hostname,
      registrableDomain: getRegistrableDomain(hostname),
      snippet: result.snippet ?? "",
    });
  }
  if (results.length === 0) {
    throw new OpenSerpError(
      "no_results_unverified",
      "OpenSERP returned no organic results; the rank was not changed.",
      { requestId: data.meta.request_id ?? requestId },
    );
  }

  return {
    provider: "openserp",
    keyword: data.query.text,
    region: input.region,
    lang: input.lang,
    fetchedAt: new Date().toISOString(),
    requestId: data.meta.request_id ?? requestId,
    results,
    serpFeatures: [
      ...new Set(
        (data.serp_features ?? [])
          .map((feature) => feature.type)
          .filter((type): type is string => Boolean(type)),
      ),
    ],
    limitRequested: input.limit,
    resultsReturned: results.length,
  };
}

async function getOpenSerpConfig(): Promise<OpenSerpConfig> {
  const [enabled, configuredUrl, timeoutValue, authToken] = await Promise.all([
    getOptionalEnvValue("OPENSERP_ENABLED"),
    getOptionalEnvValue("OPENSERP_URL"),
    getOptionalEnvValue("OPENSERP_TIMEOUT_MS"),
    getOptionalEnvValue("OPENSERP_AUTH_TOKEN"),
  ]);
  if (enabled !== "true" || !configuredUrl) {
    throw new OpenSerpError(
      "configuration_error",
      "OpenSERP is not configured. Set OPENSERP_ENABLED=true and OPENSERP_URL.",
    );
  }
  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new OpenSerpError("configuration_error", "OPENSERP_URL is invalid.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new OpenSerpError(
      "configuration_error",
      "OPENSERP_URL must not contain credentials, query parameters, or a fragment.",
    );
  }
  if (
    url.protocol !== "https:" &&
    (url.protocol !== "http:" || !isPrivateHostname(url.hostname))
  ) {
    throw new OpenSerpError(
      "configuration_error",
      "OPENSERP_URL must use HTTPS or an internal HTTP address.",
    );
  }
  const timeoutMs = timeoutValue ? Number(timeoutValue) : DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) {
    throw new OpenSerpError(
      "configuration_error",
      "OPENSERP_TIMEOUT_MS must be an integer from 100 to 60000.",
    );
  }
  return { url: url.toString(), timeoutMs, authToken };
}

async function validateOpenSerpRequest(
  locationName?: string | null,
): Promise<OpenSerpConfig> {
  if (locationName) {
    throw new OpenSerpError(
      "unsupported_targeting",
      "OpenSERP supports a market region hint, not city-level rank tracking.",
    );
  }
  return getOpenSerpConfig();
}

function withTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function authHeaders(config: OpenSerpConfig) {
  return config.authToken
    ? { Authorization: `Bearer ${config.authToken}` }
    : undefined;
}

async function readBoundedBody(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > OPEN_SERP_MAX_RESPONSE_BYTES
  ) {
    throw new OpenSerpError(
      "invalid_response",
      "OpenSERP response was too large.",
    );
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > OPEN_SERP_MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new OpenSerpError(
          "invalid_response",
          "OpenSERP response was too large.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

async function errorCodeForResponse(
  response: Response,
): Promise<OpenSerpErrorCode> {
  if (response.status === 403) {
    const body = await response.text().catch(() => "");
    return /captcha|challenge/i.test(body) ? "captcha" : "blocked";
  }
  if (response.status === 429) return "rate_limited";
  if (response.status === 408 || response.status === 504) return "timeout";
  if (response.status >= 500) return "upstream_error";
  return "invalid_response";
}

function openSerpErrorMessage(code: OpenSerpErrorCode) {
  switch (code) {
    case "captcha":
      return "OpenSERP was challenged by a CAPTCHA; no rank was recorded.";
    case "blocked":
      return "OpenSERP was blocked; no rank was recorded.";
    case "rate_limited":
      return "OpenSERP rate-limited the request; no rank was recorded.";
    case "timeout":
      return "OpenSERP request timed out; no rank was recorded.";
    case "quota_exceeded":
      return "OpenSERP daily project request limit reached; no rank was recorded.";
    default:
      return "OpenSERP request failed; no rank was recorded.";
  }
}

function isTimeoutError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const date = Date.parse(value);
  return Number.isNaN(date)
    ? undefined
    : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

function normalizeHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^www\./, "");
  return normalized.endsWith(".") ? normalized.slice(0, -1) : normalized;
}

function getRegistrableDomain(hostname: string): string | null {
  // The domain parser is already used elsewhere in the app and understands
  // country-code suffixes such as co.uk and com.vn.
  return tldtsGetDomain(hostname);
}

function isPrivateHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "openserp" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd")) {
    return true;
  }
  const parts = host.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 169 && parts[1] === 254)
  );
}
