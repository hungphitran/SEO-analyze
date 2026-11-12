/**
 * Pure types and helpers for the two optional free signals that sit next to
 * the owned-site sources: Chrome UX Report (real-user Core Web Vitals) and
 * Open PageRank (domain authority). Shared by server and client; no I/O.
 */

export const CRUX_METRIC_KEYS = ["lcp", "inp", "cls", "fcp", "ttfb"] as const;
export type CruxMetricKey = (typeof CRUX_METRIC_KEYS)[number];

export type CruxFormFactor = "ALL" | "PHONE" | "DESKTOP";
export const CRUX_FORM_FACTORS: readonly CruxFormFactor[] = [
  "ALL",
  "PHONE",
  "DESKTOP",
];

/** Official Core Web Vitals / CrUX thresholds: [good upper bound, poor lower bound]. */
export const CRUX_THRESHOLDS: Record<CruxMetricKey, [number, number]> = {
  lcp: [2500, 4000],
  inp: [200, 500],
  cls: [0.1, 0.25],
  fcp: [1800, 3000],
  ttfb: [800, 1800],
};

export type CruxRating = "good" | "needs-improvement" | "poor";

export function rateCruxMetric(
  key: CruxMetricKey,
  value: number | null,
): CruxRating | null {
  if (value == null || !Number.isFinite(value)) return null;
  const [good, poor] = CRUX_THRESHOLDS[key];
  if (value <= good) return "good";
  if (value <= poor) return "needs-improvement";
  return "poor";
}

export type CruxMetricSnapshot = {
  /** 75th percentile (ms, or unitless for CLS). */
  p75: number | null;
  /** Share of page loads in the good / needs-improvement / poor buckets (0..1). */
  good: number | null;
  needsImprovement: number | null;
  poor: number | null;
};

export type CruxRecordSummary = {
  metrics: Partial<Record<CruxMetricKey, CruxMetricSnapshot>>;
  /** ISO dates (YYYY-MM-DD) of the 28-day collection window. */
  periodStart: string | null;
  periodEnd: string | null;
};

export type CruxTrendSeries = {
  /** p75 per weekly collection period, oldest first. null = no data for that week. */
  p75s: (number | null)[];
};

export type CruxTrend = {
  /** ISO date (period end) per point, oldest first. */
  dates: string[];
  metrics: Partial<Record<CruxMetricKey, CruxTrendSeries>>;
};

/** One target (origin or URL) as shown in the UI. */
export type CruxTargetResult =
  | {
      status: "ok";
      target: string;
      record: CruxRecordSummary;
      trend: CruxTrend | null;
    }
  | { status: "no_data"; target: string }
  | {
      status: "error";
      target: string;
      message: string;
      /** Stable reason the UI shows in Vietnamese; `message` is the English detail. */
      kind?: CruxTargetErrorKind;
    };

export type CruxTargetErrorKind =
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "invalid_response"
  | "invalid_request";

export type CruxVitalsResult =
  | { state: "disabled" }
  | { state: "no_website" }
  /** A key is present but Google refused it (API not enabled, key restricted). */
  | { state: "api_not_enabled" }
  | {
      state: "ready";
      formFactor: CruxFormFactor;
      origin: CruxTargetResult;
      url: CruxTargetResult | null;
      fetchedAt: string;
    };

export type OpenPageRankResult =
  | { state: "disabled" }
  | { state: "invalid_domain" }
  | { state: "no_data"; domain: string }
  | { state: "rate_limited"; domain: string; retryAfterSeconds: number }
  /** A free key is bound to one IPv4 address; Workers calls come from others. */
  | { state: "address_blocked"; domain: string }
  | { state: "auth_error"; domain: string }
  | { state: "error"; domain: string; message: string }
  | {
      state: "ok";
      domain: string;
      /** Authority score on a 0 to 10 scale, up to 2 decimals. */
      score: number;
      /** Global position by PageRank (1 = highest). */
      rank: number | null;
      referringDomains: number | null;
      /** Score of the queried subdomain when it differs from the root domain. */
      host: { name: string; score: number | null; rank: number | null } | null;
      asOf: string | null;
      fetchedAt: string;
    };

/** Human value for a CrUX metric: CLS is unitless, times show ms or s. */
export function formatCruxValue(
  key: CruxMetricKey,
  value: number | null | undefined,
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (key === "cls") return value.toFixed(2);
  if (key === "inp") return `${Math.round(value)} ms`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.round(value)} ms`;
}

/** Open PageRank score: up to 2 decimals, no trailing zeros ("10", "4.9"). */
export function formatOpenPageRankScore(score: number): string {
  return String(Math.round(score * 100) / 100);
}
