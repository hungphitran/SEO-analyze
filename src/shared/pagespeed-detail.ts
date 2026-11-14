/**
 * What a PageSpeed Insights run keeps after reduction: category scores, lab
 * metrics, real-user (CrUX) field data for the URL and its origin, and the
 * failed audits with their estimated savings. Pure schemas and helpers shared
 * by the server (which builds it) and the client (which renders it).
 */
import { z } from "zod";
import { LIGHTHOUSE_CATEGORIES } from "@/shared/lighthouse";
import {
  CRUX_METRIC_KEYS,
  type CruxMetricKey,
} from "@/shared/real-user-signals";

const lighthouseMetricSchema = z.object({
  score: z.number().nullable(),
  displayValue: z.string().nullable(),
  numericValue: z.number().nullable(),
});

export const lighthouseMetricsSchema = z.object({
  firstContentfulPaint: lighthouseMetricSchema,
  largestContentfulPaint: lighthouseMetricSchema,
  totalBlockingTime: lighthouseMetricSchema,
  cumulativeLayoutShift: lighthouseMetricSchema,
  speedIndex: lighthouseMetricSchema,
  timeToInteractive: lighthouseMetricSchema,
  interactionToNextPaint: lighthouseMetricSchema,
  serverResponseTime: lighthouseMetricSchema,
});

export const lighthouseIssueSchema = z.object({
  category: z.enum(LIGHTHOUSE_CATEGORIES),
  auditKey: z.string(),
  title: z.string(),
  description: z.string(),
  score: z.number().nullable(),
  scoreDisplayMode: z.string().nullable(),
  displayValue: z.string().nullable(),
  impactMs: z.number().nullable(),
  impactBytes: z.number().nullable(),
  severity: z.enum(["critical", "warning", "info"]),
  items: z.array(z.string()),
});

export const lighthouseScoresSchema = z.object({
  performance: z.number().nullable(),
  accessibility: z.number().nullable(),
  "best-practices": z.number().nullable(),
  seo: z.number().nullable(),
});

const fieldMetricSchema = z.object({
  p75: z.number().nullable(),
  good: z.number().nullable(),
  needsImprovement: z.number().nullable(),
  poor: z.number().nullable(),
});

const fieldBlockSchema = z.object({
  /** PSI's overall verdict for the block: FAST, AVERAGE or SLOW. */
  overall: z.enum(["FAST", "AVERAGE", "SLOW"]).nullable(),
  metrics: z.object({
    lcp: fieldMetricSchema.optional(),
    inp: fieldMetricSchema.optional(),
    cls: fieldMetricSchema.optional(),
    fcp: fieldMetricSchema.optional(),
    ttfb: fieldMetricSchema.optional(),
  }),
});

/** Real-user data PSI returns for the tested URL and for its whole origin. */
export const fieldDataSchema = z.object({
  url: fieldBlockSchema.nullable(),
  origin: fieldBlockSchema.nullable(),
});

export type PagespeedFieldBlock = z.infer<typeof fieldBlockSchema>;
export type PagespeedFieldData = z.infer<typeof fieldDataSchema>;

/** One strategy's result as kept in a free-source snapshot. */
export const pagespeedSnapshotDetailSchema = z.object({
  fetchedAt: z.string().nullable(),
  lighthouseVersion: z.string().nullable(),
  scores: lighthouseScoresSchema,
  metrics: lighthouseMetricsSchema,
  fieldData: fieldDataSchema,
  issues: z.array(lighthouseIssueSchema),
  /** Failed audits found in total, before the snapshot kept only the top few. */
  issueCount: z.number().int().nonnegative(),
});
export type PagespeedSnapshotDetail = z.infer<
  typeof pagespeedSnapshotDetailSchema
>;

const SNAPSHOT_MAX_ISSUES = 15;
const SNAPSHOT_MAX_ITEMS = 3;
const SNAPSHOT_TEXT_LIMIT = 220;

function clip(text: string): string {
  return text.length > SNAPSHOT_TEXT_LIMIT
    ? `${text.slice(0, SNAPSHOT_TEXT_LIMIT - 1)}…`
    : text;
}

/** Keep a snapshot small: the worst audits first, with trimmed text and items. */
export function toSnapshotDetail(report: {
  metadata: { fetchedAt: string; lighthouseVersion: string | null };
  scores: z.infer<typeof lighthouseScoresSchema>;
  metrics: z.infer<typeof lighthouseMetricsSchema>;
  fieldData?: PagespeedFieldData;
  issues: z.infer<typeof lighthouseIssueSchema>[];
}): PagespeedSnapshotDetail {
  return {
    fetchedAt: report.metadata.fetchedAt,
    lighthouseVersion: report.metadata.lighthouseVersion,
    scores: report.scores,
    metrics: report.metrics,
    fieldData: report.fieldData ?? { url: null, origin: null },
    issueCount: report.issues.length,
    issues: report.issues.slice(0, SNAPSHOT_MAX_ISSUES).map((issue) => ({
      ...issue,
      description: clip(issue.description),
      items: issue.items.slice(0, SNAPSHOT_MAX_ITEMS).map(clip),
    })),
  };
}

/** The PSI metric names inside `loadingExperience.metrics`, per CrUX key. */
export const PSI_FIELD_METRICS: Record<CruxMetricKey, string> = {
  lcp: "LARGEST_CONTENTFUL_PAINT_MS",
  inp: "INTERACTION_TO_NEXT_PAINT",
  cls: "CUMULATIVE_LAYOUT_SHIFT_SCORE",
  fcp: "FIRST_CONTENTFUL_PAINT_MS",
  ttfb: "EXPERIMENTAL_TIME_TO_FIRST_BYTE",
};

export const PSI_FIELD_KEYS = CRUX_METRIC_KEYS;

/**
 * A free-source snapshot's `summary` for PageSpeed. Snapshots written before
 * the detail existed hold only `{ url, mobile: <scores> }`; those read as
 * `legacy` so the UI can say a refresh is needed instead of showing blanks.
 */
type PagespeedSnapshotView = {
  url: string | null;
  mobile: PagespeedSnapshotDetail | null;
  desktop: PagespeedSnapshotDetail | null;
  mobileError: string | null;
  desktopError: string | null;
  legacy: boolean;
};

const legacyScoresSchema = z.object({
  performanceScore: z.number().nullable(),
  accessibilityScore: z.number().nullable(),
  bestPracticesScore: z.number().nullable(),
  seoScore: z.number().nullable(),
});

const emptyMetric = { score: null, displayValue: null, numericValue: null };

export function readPagespeedSnapshot(
  summary: unknown,
): PagespeedSnapshotView | null {
  if (typeof summary !== "object" || summary === null) return null;
  const record: Record<string, unknown> = Object.fromEntries(
    Object.entries(summary),
  );
  const url = typeof record["url"] === "string" ? record["url"] : null;
  const text = (key: string) =>
    typeof record[key] === "string" ? record[key] : null;
  const mobile = pagespeedSnapshotDetailSchema.safeParse(record["mobile"]);
  const desktop = pagespeedSnapshotDetailSchema.safeParse(record["desktop"]);
  if (mobile.success || desktop.success) {
    return {
      url,
      mobile: mobile.success ? mobile.data : null,
      desktop: desktop.success ? desktop.data : null,
      mobileError: text("mobileError"),
      desktopError: text("desktopError"),
      legacy: false,
    };
  }
  const legacy = legacyScoresSchema.safeParse(record["mobile"]);
  if (!legacy.success) {
    return url || text("mobileError") || text("desktopError")
      ? {
          url,
          mobile: null,
          desktop: null,
          mobileError: text("mobileError"),
          desktopError: text("desktopError"),
          legacy: false,
        }
      : null;
  }
  return {
    url,
    mobile: {
      fetchedAt: null,
      lighthouseVersion: null,
      scores: {
        performance: legacy.data.performanceScore,
        accessibility: legacy.data.accessibilityScore,
        "best-practices": legacy.data.bestPracticesScore,
        seo: legacy.data.seoScore,
      },
      metrics: {
        firstContentfulPaint: emptyMetric,
        largestContentfulPaint: emptyMetric,
        totalBlockingTime: emptyMetric,
        cumulativeLayoutShift: emptyMetric,
        speedIndex: emptyMetric,
        timeToInteractive: emptyMetric,
        interactionToNextPaint: emptyMetric,
        serverResponseTime: emptyMetric,
      },
      fieldData: { url: null, origin: null },
      issues: [],
      issueCount: 0,
    },
    desktop: null,
    mobileError: null,
    desktopError: null,
    legacy: true,
  };
}
