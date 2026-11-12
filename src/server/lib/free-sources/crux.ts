/**
 * Chrome UX Report (CrUX) API client: real-user Core Web Vitals.
 *
 * Docs: https://developer.chrome.com/docs/crux/api
 *       https://developer.chrome.com/docs/crux/history-api
 * Endpoints (POST, JSON):
 *   https://chromeuxreport.googleapis.com/v1/records:queryRecord
 *   https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord
 *
 * Like the PageSpeed client, the key travels in the X-goog-api-key header so
 * it never appears in a URL or in a URL-bearing error message. A 404 means
 * "not enough real-user data for this target": it is a normal outcome, not an
 * error, so both queries return null for it.
 */
import { safeErrorMessage } from "@/server/lib/free-sources/redact";
import {
  CRUX_METRIC_KEYS,
  type CruxFormFactor,
  type CruxMetricKey,
  type CruxMetricSnapshot,
  type CruxRecordSummary,
  type CruxTrend,
} from "@/shared/real-user-signals";

export const CRUX_RECORD_ENDPOINT =
  "https://chromeuxreport.googleapis.com/v1/records:queryRecord";
export const CRUX_HISTORY_ENDPOINT =
  "https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord";

/** API metric names, in the order the UI shows them. */
export const CRUX_API_METRICS: Record<CruxMetricKey, string> = {
  lcp: "largest_contentful_paint",
  inp: "interaction_to_next_paint",
  cls: "cumulative_layout_shift",
  fcp: "first_contentful_paint",
  ttfb: "experimental_time_to_first_byte",
};

/** Weekly points requested from the History API (the API allows 1 to 40). */
export const CRUX_HISTORY_PERIODS = 26;

export type CruxErrorKind =
  | "not_configured"
  | "permission"
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "invalid_response"
  | "invalid_request";

export class CruxError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  /** True when Google refuses the key: API not enabled, key restricted or invalid. */
  readonly permission: boolean;
  readonly kind: CruxErrorKind;

  constructor(message: string, status: number, kind?: CruxErrorKind) {
    super(message);
    this.name = "CruxError";
    this.status = status;
    this.retryable = status === 0 || status === 429 || status >= 500;
    this.permission = status === 401 || status === 403;
    this.kind =
      kind ??
      (this.permission
        ? "permission"
        : status === 429
          ? "rate_limited"
          : status >= 500 || status === 0
            ? "unavailable"
            : "invalid_request");
  }
}

/** Per-attempt budget; the Worker has to answer a page load, not wait on Google. */
export const CRUX_REQUEST_TIMEOUT_MS = 15_000;
/** Retries on network errors and 5xx only (never 429 or 4xx: that would burn quota). */
const CRUX_RETRY_DELAYS_MS = [400, 1200];

export type CruxTarget = { origin: string } | { url: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return Object.fromEntries(Object.entries(value));
}

/** CrUX sends CLS percentiles as strings ("0.05") and may send "NaN". */
function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function round(value: number | null, digits: number): number | null {
  if (value == null) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function dateToIso(value: unknown): string | null {
  const date = asRecord(value);
  const y = toNumber(date?.year);
  const m = toNumber(date?.month);
  const d = toNumber(date?.day);
  if (y == null || m == null || d == null) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseMetric(
  key: CruxMetricKey,
  raw: unknown,
): CruxMetricSnapshot | null {
  const metric = asRecord(raw);
  if (!metric) return null;
  const p75 = toNumber(asRecord(metric.percentiles)?.p75);
  const histogram = Array.isArray(metric.histogram) ? metric.histogram : [];
  const densities = histogram.map((bin) => toNumber(asRecord(bin)?.density));
  const [good, needsImprovement, poor] = densities;
  if (p75 == null && good == null) return null;
  return {
    p75: key === "cls" ? round(p75, 3) : round(p75, 0),
    good: round(good ?? null, 4),
    needsImprovement: round(needsImprovement ?? null, 4),
    poor: round(poor ?? null, 4),
  };
}

/** Parse a queryRecord response body. Returns null when no metric has data. */
export function parseCruxRecord(payload: unknown): CruxRecordSummary | null {
  const record = asRecord(asRecord(payload)?.record);
  const metrics = asRecord(record?.metrics);
  if (!metrics) return null;

  const parsed: CruxRecordSummary["metrics"] = {};
  for (const key of CRUX_METRIC_KEYS) {
    const snapshot = parseMetric(key, metrics[CRUX_API_METRICS[key]]);
    if (snapshot) parsed[key] = snapshot;
  }
  if (Object.keys(parsed).length === 0) return null;

  const period = asRecord(record?.collectionPeriod);
  return {
    metrics: parsed,
    periodStart: dateToIso(period?.firstDate),
    periodEnd: dateToIso(period?.lastDate),
  };
}

/** Parse a queryHistoryRecord response body into per-metric p75 series. */
export function parseCruxHistory(payload: unknown): CruxTrend | null {
  const record = asRecord(asRecord(payload)?.record);
  const metrics = asRecord(record?.metrics);
  const periods = Array.isArray(record?.collectionPeriods)
    ? record.collectionPeriods
    : [];
  if (!metrics || periods.length === 0) return null;

  const dates = periods.map(
    (period) => dateToIso(asRecord(period)?.lastDate) ?? "",
  );
  const out: CruxTrend["metrics"] = {};
  for (const key of CRUX_METRIC_KEYS) {
    const series = asRecord(
      asRecord(metrics[CRUX_API_METRICS[key]])?.percentilesTimeseries,
    );
    const raw = Array.isArray(series?.p75s) ? series.p75s : [];
    if (raw.length === 0) continue;
    const digits = key === "cls" ? 3 : 0;
    const p75s = dates.map((_, index) => round(toNumber(raw[index]), digits));
    if (p75s.every((value) => value == null)) continue;
    out[key] = { p75s };
  }
  if (Object.keys(out).length === 0) return null;
  return { dates, metrics: out };
}

async function postCrux(input: {
  endpoint: string;
  body: Record<string, unknown>;
  apiKey: string;
  fetchImpl?: typeof fetch;
  retryDelaysMs?: readonly number[];
  timeoutMs?: number;
}): Promise<unknown> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) {
    throw new CruxError(
      "Chrome UX Report is not configured. Set CRUX_API_KEY.",
      0,
      "not_configured",
    );
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const delays = input.retryDelaysMs ?? CRUX_RETRY_DELAYS_MS;

  for (let attempt = 0; ; attempt++) {
    const retryLater = async (): Promise<boolean> => {
      if (attempt >= delays.length) return false;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      return true;
    };

    let response: Response;
    try {
      response = await fetchImpl(input.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": apiKey,
        },
        body: JSON.stringify(input.body),
        signal: AbortSignal.timeout(input.timeoutMs ?? CRUX_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      const failure = new CruxError(
        `Chrome UX Report request failed: ${safeErrorMessage(error, apiKey)}`,
        0,
        timedOut ? "timeout" : "unavailable",
      );
      if (await retryLater()) continue;
      throw failure;
    }

    const bodyText = await response.text().catch(() => "");
    let payload: unknown = null;
    let malformed = false;
    try {
      payload = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      malformed = true;
    }

    // 404 is Google's "not enough real-user data for this target", not an error.
    if (response.status === 404) return null;
    if (!response.ok) {
      const error = asRecord(asRecord(payload)?.error);
      const message =
        (typeof error?.message === "string" && error.message) ||
        `Chrome UX Report returned HTTP ${response.status}.`;
      const failure = new CruxError(
        safeErrorMessage(message, apiKey),
        response.status,
      );
      // Only a server-side blip is worth another try.
      if (response.status >= 500 && (await retryLater())) continue;
      throw failure;
    }
    // A 200 whose body is not JSON (a proxy page, truncation) must not read as
    // "no data": that would hide a real outage behind a calm message.
    if (malformed || payload === null) {
      throw new CruxError(
        "Chrome UX Report returned an unreadable response.",
        502,
        "invalid_response",
      );
    }
    return payload;
  }
}

function requestBody(
  target: CruxTarget,
  formFactor: CruxFormFactor,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...target,
    ...(formFactor === "ALL" ? {} : { formFactor }),
    metrics: Object.values(CRUX_API_METRICS),
    ...extra,
  };
}

/** Latest 28-day real-user record for an origin or URL. null = no data (404). */
export async function queryCruxRecord(input: {
  target: CruxTarget;
  formFactor?: CruxFormFactor;
  apiKey: string;
  fetchImpl?: typeof fetch;
  retryDelaysMs?: readonly number[];
}): Promise<CruxRecordSummary | null> {
  const payload = await postCrux({
    endpoint: CRUX_RECORD_ENDPOINT,
    body: requestBody(input.target, input.formFactor ?? "ALL"),
    apiKey: input.apiKey,
    fetchImpl: input.fetchImpl,
    retryDelaysMs: input.retryDelaysMs,
  });
  return payload == null ? null : parseCruxRecord(payload);
}

/** Weekly p75 history (History API). null = no data (404). */
export async function queryCruxHistory(input: {
  target: CruxTarget;
  formFactor?: CruxFormFactor;
  apiKey: string;
  periods?: number;
  fetchImpl?: typeof fetch;
  retryDelaysMs?: readonly number[];
}): Promise<CruxTrend | null> {
  const payload = await postCrux({
    endpoint: CRUX_HISTORY_ENDPOINT,
    body: requestBody(input.target, input.formFactor ?? "ALL", {
      collectionPeriodCount: input.periods ?? CRUX_HISTORY_PERIODS,
    }),
    apiKey: input.apiKey,
    fetchImpl: input.fetchImpl,
    retryDelaysMs: input.retryDelaysMs,
  });
  return payload == null ? null : parseCruxHistory(payload);
}
