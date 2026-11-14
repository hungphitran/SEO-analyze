/**
 * Turns a PageSpeed Insights v5 response into the stored Lighthouse payload
 * (scores, lab metrics, failed audits with savings) plus the real-user field
 * data PSI returns beside it. Pure: no I/O.
 */
import { safeErrorMessage } from "@/server/lib/free-sources/redact";
import {
  buildStoredLighthouseIssues,
  buildStoredLighthouseMetrics,
  scoreToPercent,
  type RawLighthouseAudit,
  type RawLighthouseCategory,
  type StoredLighthousePayload,
} from "@/server/lib/lighthouseStoredPayload";
import {
  PSI_FIELD_KEYS,
  PSI_FIELD_METRICS,
  type PagespeedFieldBlock,
  type PagespeedFieldData,
  toSnapshotDetail,
} from "@/shared/pagespeed-detail";
import type { CruxMetricKey } from "@/shared/real-user-signals";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return Object.fromEntries(Object.entries(value));
}

function toNumber(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function round(value: number | null, digits: number): number | null {
  if (value == null) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

type FieldMetric = NonNullable<PagespeedFieldBlock["metrics"][CruxMetricKey]>;

function parseFieldMetric(
  key: CruxMetricKey,
  raw: unknown,
): FieldMetric | null {
  const metric = asRecord(raw);
  if (!metric) return null;
  const percentile = toNumber(metric.percentile);
  const distributions = Array.isArray(metric.distributions)
    ? metric.distributions
    : [];
  const [good, needsImprovement, poor] = distributions.map((bin) =>
    toNumber(asRecord(bin)?.proportion),
  );
  if (percentile == null && good == null) return null;
  return {
    // PSI reports CLS multiplied by 100 (a score of 0.05 arrives as 5).
    p75: key === "cls" ? round(percentile && percentile / 100, 3) : percentile,
    good: round(good ?? null, 4),
    needsImprovement: round(needsImprovement ?? null, 4),
    poor: round(poor ?? null, 4),
  };
}

const OVERALL = new Set(["FAST", "AVERAGE", "SLOW"]);

/** One `loadingExperience` block. null = Google had no real-user data for it. */
export function parseFieldBlock(raw: unknown): PagespeedFieldBlock | null {
  const block = asRecord(raw);
  const rawMetrics = asRecord(block?.metrics);
  if (!rawMetrics) return null;
  const metrics: PagespeedFieldBlock["metrics"] = {};
  for (const key of PSI_FIELD_KEYS) {
    const parsed = parseFieldMetric(key, rawMetrics[PSI_FIELD_METRICS[key]]);
    if (parsed) metrics[key] = parsed;
  }
  if (Object.keys(metrics).length === 0) return null;
  const overall = block?.overall_category;
  return {
    overall:
      typeof overall === "string" && OVERALL.has(overall)
        ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- narrowed by the OVERALL set just above
          (overall as "FAST" | "AVERAGE" | "SLOW")
        : null,
    metrics,
  };
}

export function parsePagespeedFieldData(payload: unknown): PagespeedFieldData {
  const root = asRecord(payload);
  return {
    url: parseFieldBlock(root?.loadingExperience),
    origin: parseFieldBlock(root?.originLoadingExperience),
  };
}

function auditMap(raw: unknown): Record<string, RawLighthouseAudit> {
  const audits = asRecord(raw) ?? {};
  const out: Record<string, RawLighthouseAudit> = {};
  for (const [key, value] of Object.entries(audits)) {
    const audit = asRecord(value);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Lighthouse audit JSON; the builder reads each field defensively
    if (audit) out[key] = audit as RawLighthouseAudit;
  }
  return out;
}

function categoryMap(raw: unknown): Record<string, RawLighthouseCategory> {
  const categories = asRecord(raw) ?? {};
  const out: Record<string, RawLighthouseCategory> = {};
  for (const [key, value] of Object.entries(categories)) {
    const category = asRecord(value);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Lighthouse category JSON; the builder reads each field defensively
    if (category) out[key] = category as RawLighthouseCategory;
  }
  return out;
}

export function buildPagespeedReport(input: {
  payload: unknown;
  url: string;
  strategy: "mobile" | "desktop";
  now?: Date;
}): StoredLighthousePayload {
  const root = asRecord(input.payload);
  const lighthouse = asRecord(root?.lighthouseResult);
  const audits = auditMap(lighthouse?.audits);
  const categories = categoryMap(lighthouse?.categories);
  const { hasIssueDetails, issues } = buildStoredLighthouseIssues({
    audits,
    categories,
  });
  const fieldData = parsePagespeedFieldData(input.payload);
  const metrics = buildStoredLighthouseMetrics({ audits });
  // Lighthouse has no interaction in a lab run, so INP comes from real users.
  const fieldInp = fieldData.url?.metrics.inp ?? fieldData.origin?.metrics.inp;
  if (metrics.interactionToNextPaint.numericValue == null && fieldInp?.p75) {
    metrics.interactionToNextPaint = {
      score: null,
      displayValue: `${fieldInp.p75} ms`,
      numericValue: fieldInp.p75,
    };
  }
  return {
    version: 2,
    source: "pagespeed-insights",
    hasIssueDetails,
    metadata: {
      requestedUrl:
        typeof lighthouse?.requestedUrl === "string"
          ? lighthouse.requestedUrl
          : input.url,
      finalUrl:
        typeof lighthouse?.finalUrl === "string"
          ? lighthouse.finalUrl
          : input.url,
      strategy: input.strategy,
      fetchedAt:
        typeof lighthouse?.fetchTime === "string"
          ? lighthouse.fetchTime
          : (input.now ?? new Date()).toISOString(),
      lighthouseVersion:
        typeof lighthouse?.lighthouseVersion === "string"
          ? lighthouse.lighthouseVersion
          : null,
      taskId: null,
      cost: null,
    },
    scores: {
      performance: scoreToPercent(categories.performance?.score),
      accessibility: scoreToPercent(categories.accessibility?.score),
      "best-practices": scoreToPercent(categories["best-practices"]?.score),
      seo: scoreToPercent(categories.seo?.score),
    },
    metrics,
    fieldData,
    issues,
  };
}

type PagespeedSettled = PromiseSettledResult<{
  report: StoredLighthousePayload;
}>;

/** The snapshot summary: each strategy's reduced result, or its error text. */
export function buildPagespeedSnapshotSummary(input: {
  url: string;
  mobile: PagespeedSettled;
  desktop: PagespeedSettled;
  apiKey: string;
}) {
  const part = (run: PagespeedSettled) =>
    run.status === "fulfilled"
      ? { detail: toSnapshotDetail(run.value.report), error: null }
      : { detail: null, error: safeErrorMessage(run.reason, input.apiKey) };
  const mobile = part(input.mobile);
  const desktop = part(input.desktop);
  return {
    url: input.url,
    mobile: mobile.detail,
    desktop: desktop.detail,
    mobileError: mobile.error,
    desktopError: desktop.error,
  };
}
