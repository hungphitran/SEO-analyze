import { z } from "zod";

const DATA_STATES = [
  "ok",
  "partial",
  "stale",
  "insufficient_data",
  "not_configured",
  "quota_exceeded",
  "blocked",
  "provider_error",
  "unavailable",
] as const;

export const dataStateSchema = z.enum(DATA_STATES);
export type DataState = z.infer<typeof dataStateSchema>;

const EVIDENCE_SOURCES = [
  "gsc",
  "ga4",
  "bing_webmaster",
  "openserp",
  "pagespeed",
  "crux",
  "open_pagerank",
  "bing_ai_csv",
  "google_genai_csv",
  "local_crawler",
] as const;

export const evidenceSourceSchema = z.enum(EVIDENCE_SOURCES);
export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;

const EVIDENCE_GRANULARITIES = ["instant", "day", "week", "month"] as const;
const evidenceGranularitySchema = z.enum(EVIDENCE_GRANULARITIES);
type EvidenceGranularity = z.infer<typeof evidenceGranularitySchema>;

const EVIDENCE_COMPLETENESS = [
  "complete",
  "partial",
  "sampled",
  "unknown",
] as const;
const evidenceCompletenessSchema = z.enum(EVIDENCE_COMPLETENESS);
type EvidenceCompleteness = z.infer<typeof evidenceCompletenessSchema>;

type EvidenceEnvelope<T> = {
  source: EvidenceSource;
  projectId: string;
  observedAt: string;
  periodStart?: string;
  periodEnd?: string;
  granularity?: EvidenceGranularity;
  state: DataState;
  completeness?: EvidenceCompleteness;
  attribution?: string;
  payload: T | null;
  diagnosticCode?: string;
};

export function createEvidenceEnvelopeSchema<T extends z.ZodTypeAny>(
  payloadSchema: T,
) {
  return z.object({
    source: evidenceSourceSchema,
    projectId: z.string(),
    observedAt: z.string(),
    periodStart: z.string().optional(),
    periodEnd: z.string().optional(),
    granularity: evidenceGranularitySchema.optional(),
    state: dataStateSchema,
    completeness: evidenceCompletenessSchema.optional(),
    attribution: z.string().optional(),
    payload: payloadSchema.nullable(),
    diagnosticCode: z.string().optional(),
  });
}

export function buildEvidenceEnvelope<T>(input: {
  source: EvidenceSource;
  projectId: string;
  state: DataState;
  payload: T | null;
  observedAt?: string;
  periodStart?: string;
  periodEnd?: string;
  granularity?: EvidenceGranularity;
  completeness?: EvidenceCompleteness;
  attribution?: string;
  diagnosticCode?: string;
}): EvidenceEnvelope<T> {
  return {
    source: input.source,
    projectId: input.projectId,
    observedAt: input.observedAt ?? new Date().toISOString(),
    ...(input.periodStart ? { periodStart: input.periodStart } : {}),
    ...(input.periodEnd ? { periodEnd: input.periodEnd } : {}),
    ...(input.granularity ? { granularity: input.granularity } : {}),
    state: input.state,
    ...(input.completeness ? { completeness: input.completeness } : {}),
    ...(input.attribution ? { attribution: input.attribution } : {}),
    payload: input.payload,
    ...(input.diagnosticCode ? { diagnosticCode: input.diagnosticCode } : {}),
  };
}
