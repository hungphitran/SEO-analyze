/**
 * Bing Webmaster Tools JSON/REST API client.
 *
 * Official access: https://learn.microsoft.com/en-us/bingwebmaster/getting-access
 * JSON protocol: https://ssl.bing.com/webmaster/api.svc/json/METHOD_NAME
 * SOAP/POX endpoints are deprecated (retire 31 Aug 2026); this client uses JSON only.
 *
 * Auth is an API key as the official `apikey` query parameter. The key is
 * never logged; error messages have it stripped. Only verified sites are
 * returned or queried — unverified properties are refused.
 */
import { AppError } from "@/server/lib/errors";
import {
  redactApiKeyQuery,
  safeErrorMessage,
} from "@/server/lib/free-sources/redact";

export const BING_WEBMASTER_JSON_BASE =
  "https://ssl.bing.com/webmaster/api.svc/json";

export type BingVerifiedSite = {
  url: string;
};

export type BingQueryStat = {
  query: string;
  clicks: number;
  impressions: number;
  avgImpressionPosition: number | null;
  avgClickPosition: number | null;
};

export type BingQuerySummary = {
  siteUrl: string;
  queryCount: number;
  totalClicks: number;
  totalImpressions: number;
  queries: BingQueryStat[];
};

/**
 * What went wrong, independent of Bing's wording, so the app can show clear
 * Vietnamese copy: key_rejected (401/403/InvalidApiKey), not_verified (site is
 * not a verified site of the key), throttled (429), unavailable (network, 5xx,
 * timeout), invalid_response (unreadable payload), invalid_input (no key).
 */
export type BingErrorKind =
  | "key_rejected"
  | "not_verified"
  | "throttled"
  | "unavailable"
  | "invalid_response"
  | "invalid_input";

export class BingWebmasterError extends Error {
  readonly status: number;
  readonly kind: BingErrorKind;
  /** Bing's own numeric ApiErrorCode from the error body, when it sent one. */
  readonly errorCode: number | null;

  constructor(
    message: string,
    status = 0,
    kind: BingErrorKind = "unavailable",
    errorCode: number | null = null,
  ) {
    super(message);
    this.name = "BingWebmasterError";
    this.status = status;
    this.kind = kind;
    this.errorCode = errorCode;
  }
}

// Bing's ApiErrorCode enum (Microsoft.Bing.Webmaster.Api.Interfaces).
const BING_CODE_INVALID_API_KEY = 3;
const BING_CODE_THROTTLE_USER = 4;
const BING_CODE_THROTTLE_HOST = 5;
const BING_CODE_NOT_AUTHORIZED = 14;

const BING_TIMEOUT_MS = 15_000;
const BING_RETRY_DELAYS_MS = [400, 1200];

/**
 * Classify a non-2xx Bing response. Bing reports API errors as HTTP 400 with
 * `{ErrorCode, Message}`, so the numeric ErrorCode (then the HTTP status) is
 * authoritative; message text is only a fallback when no ErrorCode is present.
 * Only HTTP 429 or ThrottleUser/ThrottleHost count as throttling: loose word
 * matches such as "quota" used to turn unrelated errors into "too many
 * requests".
 */
export function kindForResponse(
  status: number,
  message: string,
  errorCode: number | null = null,
): BingErrorKind {
  if (errorCode === BING_CODE_INVALID_API_KEY) return "key_rejected";
  if (
    errorCode === BING_CODE_THROTTLE_USER ||
    errorCode === BING_CODE_THROTTLE_HOST
  ) {
    return "throttled";
  }
  if (status === 429) return "throttled";
  if (status === 401 || status === 403) return "key_rejected";
  if (errorCode === BING_CODE_NOT_AUTHORIZED) return "key_rejected";
  if (errorCode === null) {
    if (/invalid.?api.?key|not.?authori[sz]ed|unauthori[sz]ed/i.test(message)) {
      return "key_rejected";
    }
    if (/throttle(user|host)/i.test(message)) return "throttled";
  }
  return "unavailable";
}

/** Safe, one-line diagnostics for Workers Logs. Never includes the key/URL. */
function logBingFailure(fields: {
  method: string;
  status: number;
  errorCode: number | null;
  kind: BingErrorKind;
  message: string;
  attempts: number;
  retryAfter: string | null;
}) {
  console.warn(
    `bing.webmaster failure method=${fields.method} status=${fields.status} errorCode=${fields.errorCode ?? "none"} kind=${fields.kind} attempts=${fields.attempts} retryAfter=${fields.retryAfter ?? "none"} message=${JSON.stringify(fields.message.slice(0, 160))}`,
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return Object.fromEntries(Object.entries(value));
}

function stringField(
  record: Record<string, unknown> | null,
  name: string,
): string | null {
  const value = record?.[name];
  return typeof value === "string" ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseBingDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const ticks = /\/Date\((\d+)/.exec(value);
  if (ticks) {
    const date = new Date(Number(ticks[1]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function bingGet<T>(input: {
  method: string;
  apiKey: string;
  params?: Record<string, string>;
  fetchImpl?: typeof fetch;
  retryDelaysMs?: number[];
  map: (payload: unknown) => T;
}): Promise<T> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) {
    throw new BingWebmasterError(
      "A Bing Webmaster API key is required.",
      0,
      "invalid_input",
    );
  }

  const url = new URL(`${BING_WEBMASTER_JSON_BASE}/${input.method}`);
  url.searchParams.set("apikey", apiKey);
  for (const [name, value] of Object.entries(input.params ?? {})) {
    url.searchParams.set(name, value);
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const delays = input.retryDelaysMs ?? BING_RETRY_DELAYS_MS;
  // Reads are idempotent, so transient failures (network error, timeout, 5xx)
  // are retried a bounded number of times with backoff. Key, throttling and
  // client errors are never retried.
  let response: Response | undefined;
  let bodyText = "";
  let attempts = 0;
  for (let attempt = 0; ; attempt++) {
    attempts = attempt + 1;
    let failure: BingWebmasterError | null = null;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(BING_TIMEOUT_MS),
      });
      bodyText = await response.text();
      if (response.status >= 500) {
        failure = new BingWebmasterError(
          `Bing Webmaster returned HTTP ${response.status}.`,
          response.status,
          "unavailable",
        );
      }
    } catch (error) {
      failure = new BingWebmasterError(
        `Bing Webmaster request failed: ${safeErrorMessage(error, apiKey)}`,
        0,
        "unavailable",
      );
    }
    if (!failure) break;
    const delay = delays[attempt];
    if (delay === undefined) throw failure;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  if (!response) {
    throw new BingWebmasterError(
      "Bing Webmaster did not respond.",
      0,
      "unavailable",
    );
  }
  let payload: unknown = null;
  let parsedOk = true;
  try {
    payload = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    payload = null;
    parsedOk = false;
  }

  if (!response.ok) {
    const payloadRecord = asRecord(payload);
    const rawCode = payloadRecord?.ErrorCode ?? payloadRecord?.errorCode;
    const errorCode =
      typeof rawCode === "number" && Number.isInteger(rawCode) ? rawCode : null;
    const message =
      stringField(payloadRecord, "Message") ??
      stringField(payloadRecord, "message") ??
      `Bing Webmaster returned HTTP ${response.status}.`;
    const kind = kindForResponse(response.status, message, errorCode);
    const safeMessage = redactApiKeyQuery(safeErrorMessage(message, apiKey));
    logBingFailure({
      method: input.method,
      status: response.status,
      errorCode,
      kind,
      message: safeMessage,
      attempts,
      retryAfter: response.headers.get("retry-after"),
    });
    throw new BingWebmasterError(safeMessage, response.status, kind, errorCode);
  }
  if (!parsedOk) {
    throw new BingWebmasterError(
      "Could not read the Bing Webmaster response: it was not valid JSON.",
      response.status,
      "invalid_response",
    );
  }

  try {
    return input.map(payload);
  } catch (error) {
    throw new BingWebmasterError(
      `Could not read the Bing Webmaster response: ${safeErrorMessage(error, apiKey)}`,
      response.status,
      "invalid_response",
    );
  }
}

export function parseBingSitesPayload(payload: unknown): BingVerifiedSite[] {
  const rows = asArray(asRecord(payload)?.d);
  const sites: BingVerifiedSite[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;
    const url = typeof record.Url === "string" ? record.Url.trim() : "";
    if (!url) continue;
    if (record.IsVerified !== true) continue;
    // Never surface AuthenticationCode or DnsVerificationCode.
    sites.push({ url });
  }
  return sites;
}

export async function listVerifiedBingSites(input: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  retryDelaysMs?: number[];
}): Promise<BingVerifiedSite[]> {
  return bingGet({
    method: "GetUserSites",
    apiKey: input.apiKey,
    fetchImpl: input.fetchImpl,
    retryDelaysMs: input.retryDelaysMs,
    map: parseBingSitesPayload,
  });
}

export function parseBingQueryStatsPayload(
  payload: unknown,
  siteUrl: string,
  options?: { sinceMs?: number; limit?: number },
): BingQuerySummary {
  const sinceMs = options?.sinceMs;
  const limit = options?.limit ?? 25;
  const byQuery = new Map<string, BingQueryStat & { dated: boolean }>();

  for (const row of asArray(asRecord(payload)?.d)) {
    const record = asRecord(row);
    if (!record) continue;
    const query = typeof record.Query === "string" ? record.Query.trim() : "";
    if (!query) continue;
    const date = parseBingDate(record.Date);
    if (sinceMs != null && date && date.getTime() < sinceMs) continue;

    const current = byQuery.get(query) ?? {
      query,
      clicks: 0,
      impressions: 0,
      avgImpressionPosition: null,
      avgClickPosition: null,
      dated: false,
    };
    current.clicks += numberOrZero(record.Clicks);
    current.impressions += numberOrZero(record.Impressions);
    current.avgImpressionPosition = numberOrNull(record.AvgImpressionPosition);
    current.avgClickPosition = numberOrNull(record.AvgClickPosition);
    current.dated = current.dated || date != null;
    byQuery.set(query, current);
  }

  const ranked = [...byQuery.values()];
  // ES2022 typings have no Array#toSorted.
  ranked.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
  const queries = ranked
    .slice(0, limit)
    .map(({ dated: _dated, ...stat }) => stat);

  return {
    siteUrl,
    queryCount: queries.length,
    totalClicks: queries.reduce((sum, row) => sum + row.clicks, 0),
    totalImpressions: queries.reduce((sum, row) => sum + row.impressions, 0),
    queries,
  };
}

export async function getBingQueryStats(input: {
  apiKey: string;
  siteUrl: string;
  fetchImpl?: typeof fetch;
  retryDelaysMs?: number[];
  sinceMs?: number;
  limit?: number;
}): Promise<BingQuerySummary> {
  return bingGet({
    method: "GetQueryStats",
    apiKey: input.apiKey,
    params: { siteUrl: input.siteUrl },
    fetchImpl: input.fetchImpl,
    retryDelaysMs: input.retryDelaysMs,
    map: (payload) =>
      parseBingQueryStatsPayload(payload, input.siteUrl, {
        sinceMs: input.sinceMs,
        limit: input.limit,
      }),
  });
}

/** Compare site URLs ignoring case and a trailing slash. */
function normalizeBingSite(value: string) {
  return value.trim().toLowerCase().replace(/\/+$/, "");
}

export function sameBingSite(a: string, b: string) {
  return normalizeBingSite(a) === normalizeBingSite(b);
}

export async function assertVerifiedBingSite(input: {
  apiKey: string;
  siteUrl: string;
  fetchImpl?: typeof fetch;
  retryDelaysMs?: number[];
}): Promise<BingVerifiedSite> {
  const sites = await listVerifiedBingSites(input);
  const match = sites.find((site) => sameBingSite(site.url, input.siteUrl));
  if (!match) {
    throw new BingWebmasterError(
      "That site is not in the verified sites for this Bing Webmaster API key. Verify the site in Bing Webmaster Tools first, then pick it from the list.",
      0,
      "not_verified",
    );
  }
  return match;
}

/**
 * Turn a Bing client failure into an AppError whose code the browser maps to
 * Vietnamese guidance. The message is key-free (it was redacted at the source).
 */
export function toBingAppError(error: unknown): unknown {
  if (!(error instanceof BingWebmasterError)) return error;
  switch (error.kind) {
    case "key_rejected":
      return new AppError("BING_KEY_REJECTED", error.message);
    case "not_verified":
      return new AppError("BING_SITE_NOT_VERIFIED", error.message);
    case "invalid_input":
      return new AppError("VALIDATION_ERROR", error.message);
    case "throttled":
      // Bing's own ThrottleUser/ThrottleHost (or HTTP 429), not our app's
      // rate limit, so it gets its own code and accurate copy.
      return new AppError("BING_THROTTLED", error.message);
    default:
      return new AppError("BING_UNAVAILABLE", error.message);
  }
}

/** Fixed, key-free snapshot text per failure kind (localized in the browser). */
export function bingRefreshMessage(error: unknown, apiKey: string): string {
  if (error instanceof BingWebmasterError) {
    switch (error.kind) {
      case "key_rejected":
        return "Bing Webmaster rejected the stored API key. Disconnect and save a new key.";
      case "throttled":
        return "Bing Webmaster is throttling this key. Try again later.";
      case "invalid_response":
        return "Bing Webmaster returned an unreadable response.";
      case "unavailable":
        return "Bing Webmaster could not be reached. Try again in a few minutes.";
      default:
        break;
    }
  }
  return safeErrorMessage(error, apiKey);
}
