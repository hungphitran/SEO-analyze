import { z } from "zod";
import { LIGHTHOUSE_CATEGORIES } from "@/shared/lighthouse";
import {
  fieldDataSchema,
  lighthouseIssueSchema,
  lighthouseMetricsSchema,
  lighthouseScoresSchema,
} from "@/shared/pagespeed-detail";

export type RawLighthouseAudit = {
  title?: string;
  description?: string;
  score?: number | null;
  scoreDisplayMode?: string;
  displayValue?: string;
  numericValue?: number;
  numericUnit?: string;
  details?: {
    overallSavingsMs?: number;
    overallSavingsBytes?: number;
    /** Newer "insight" audits report a single object instead of a list. */
    items?: Array<Record<string, unknown>> | Record<string, unknown>;
  };
};

export type RawLighthouseCategory = {
  score?: number | null;
  auditRefs?: Array<{
    id?: string;
  }>;
};

const storedLighthouseIssueSchema = lighthouseIssueSchema;
const storedLighthouseMetricsSchema = lighthouseMetricsSchema;

export const storedLighthousePayloadSchema = z.object({
  version: z.literal(2),
  source: z.enum(["dataforseo-lighthouse", "pagespeed-insights"]),
  hasIssueDetails: z.boolean(),
  metadata: z.object({
    requestedUrl: z.string(),
    finalUrl: z.string(),
    strategy: z.enum(["mobile", "desktop"]),
    fetchedAt: z.string(),
    lighthouseVersion: z.string().nullable(),
    taskId: z.string().nullable(),
    cost: z.number().nullable(),
  }),
  scores: lighthouseScoresSchema,
  metrics: storedLighthouseMetricsSchema,
  /** Real-user data for the URL and origin; only PageSpeed Insights returns it. */
  fieldData: fieldDataSchema.optional(),
  issues: z.array(storedLighthouseIssueSchema),
});

type StoredLighthouseMetrics = z.infer<typeof storedLighthouseMetricsSchema>;
export type StoredLighthouseIssue = z.infer<typeof storedLighthouseIssueSchema>;
export type StoredLighthousePayload = z.infer<
  typeof storedLighthousePayloadSchema
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function scoreToPercent(
  score: number | null | undefined,
): number | null {
  if (typeof score !== "number" || Number.isNaN(score)) return null;
  return Math.round(score * 100);
}

function buildStoredMetric(
  audit: RawLighthouseAudit | undefined,
): StoredLighthouseMetrics["firstContentfulPaint"] {
  return {
    score: scoreToPercent(audit?.score),
    displayValue: audit?.displayValue ?? null,
    numericValue:
      typeof audit?.numericValue === "number" ? audit.numericValue : null,
  };
}

const DIAGNOSTIC_AUDIT_KEYS = new Set([
  "largest-contentful-paint-element",
  "layout-shifts",
  "diagnostics",
  "metrics",
  "network-requests",
  "network-rtt",
  "network-server-latency",
  "main-thread-tasks",
  "screenshot-thumbnails",
  "final-screenshot",
  "script-treemap-data",
  "resource-summary",
]);

function compactItem(item: Record<string, unknown>): string {
  const preferredKeys = [
    "url",
    "source",
    "nodeLabel",
    "snippet",
    "totalBytes",
    "wastedBytes",
    "wastedMs",
    "label",
    "value",
  ];

  // Insight audits nest the element under `node`; lift its label and snippet.
  const node = isRecord(item.node) ? item.node : null;
  const flat: Record<string, unknown> = node ? { ...node, ...item } : item;

  const output: Record<string, unknown> = {};
  for (const key of preferredKeys) {
    if (flat[key] != null && typeof flat[key] !== "object") {
      output[key] = flat[key];
    }
  }

  if (Object.keys(output).length === 0) {
    for (const [key, value] of Object.entries(item).slice(0, 6)) {
      output[key] = value;
    }
  }

  return JSON.stringify(output);
}

function getSeverity(input: {
  score: number | null;
  impactMs: number | null;
  impactBytes: number | null;
}): "critical" | "warning" | "info" {
  if ((input.impactMs ?? 0) >= 300 || (input.impactBytes ?? 0) >= 150_000) {
    return "critical";
  }

  if (input.score != null && input.score < 50) {
    return "critical";
  }

  if ((input.impactMs ?? 0) >= 100 || (input.impactBytes ?? 0) >= 50_000) {
    return "warning";
  }

  if (input.score != null && input.score < 90) {
    return "warning";
  }

  return "info";
}

/**
 * Estimated savings. Classic "opportunity" audits report them in `details`;
 * Lighthouse 12+ "insight" audits keep them in `numericValue` with a unit.
 * Only `*-insight` audits use that fallback: other audits (total-byte-weight,
 * bootup-time) put a plain total there, which would read as a fake saving.
 */
function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readImpact(
  auditKey: string,
  audit: RawLighthouseAudit,
): { impactMs: number | null; impactBytes: number | null } {
  let impactMs = finiteNumber(audit.details?.overallSavingsMs);
  let impactBytes = finiteNumber(audit.details?.overallSavingsBytes);
  if (
    impactMs == null &&
    impactBytes == null &&
    auditKey.endsWith("-insight") &&
    audit.scoreDisplayMode === "metricSavings"
  ) {
    const value = finiteNumber(audit.numericValue);
    if (value != null && value > 0) {
      if (audit.numericUnit === "millisecond") impactMs = value;
      else if (audit.numericUnit === "byte") impactBytes = value;
    }
  }
  return { impactMs, impactBytes };
}

export function buildStoredLighthouseIssues(input: {
  audits: Record<string, RawLighthouseAudit>;
  categories: Record<string, RawLighthouseCategory>;
}) {
  const hasIssueDetails = LIGHTHOUSE_CATEGORIES.some(
    (category) => (input.categories[category]?.auditRefs?.length ?? 0) > 0,
  );

  const issues: StoredLighthouseIssue[] = [];

  for (const category of LIGHTHOUSE_CATEGORIES) {
    const rawRefs = input.categories[category]?.auditRefs;
    const refs = Array.isArray(rawRefs) ? rawRefs : [];
    for (const ref of refs) {
      const auditKey = ref?.id;
      if (!auditKey) continue;

      const audit = input.audits[auditKey];
      if (!audit) continue;

      const score = scoreToPercent(audit.score);
      const scoreDisplayMode = audit.scoreDisplayMode ?? null;

      if (scoreDisplayMode === "numeric") continue;
      if (DIAGNOSTIC_AUDIT_KEYS.has(auditKey)) continue;

      const isPass =
        score == null ||
        score >= 90 ||
        scoreDisplayMode === "notApplicable" ||
        scoreDisplayMode === "informative" ||
        scoreDisplayMode === "manual" ||
        scoreDisplayMode === "error";

      if (isPass) continue;

      const { impactMs, impactBytes } = readImpact(auditKey, audit);
      const rawItems = audit.details?.items;
      const itemList = Array.isArray(rawItems)
        ? rawItems
        : isRecord(rawItems)
          ? [rawItems]
          : [];
      const items = itemList.filter(isRecord).slice(0, 10).map(compactItem);

      issues.push({
        category,
        auditKey,
        title: audit.title ?? auditKey,
        description: audit.description ?? "",
        score,
        scoreDisplayMode,
        displayValue: audit.displayValue ?? null,
        impactMs,
        impactBytes,
        severity: getSeverity({ score, impactMs, impactBytes }),
        items,
      });
    }
  }

  return {
    hasIssueDetails,
    issues,
  };
}

export function buildStoredLighthouseMetrics(input: {
  audits: Record<string, RawLighthouseAudit>;
}): StoredLighthouseMetrics {
  return {
    firstContentfulPaint: buildStoredMetric(
      input.audits["first-contentful-paint"],
    ),
    largestContentfulPaint: buildStoredMetric(
      input.audits["largest-contentful-paint"],
    ),
    totalBlockingTime: buildStoredMetric(input.audits["total-blocking-time"]),
    cumulativeLayoutShift: buildStoredMetric(
      input.audits["cumulative-layout-shift"],
    ),
    speedIndex: buildStoredMetric(input.audits["speed-index"]),
    timeToInteractive: buildStoredMetric(input.audits.interactive),
    interactionToNextPaint: buildStoredMetric(
      input.audits["interaction-to-next-paint"],
    ),
    serverResponseTime: buildStoredMetric(input.audits["server-response-time"]),
  };
}
