import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  buildEvidenceEnvelope,
  createEvidenceEnvelopeSchema,
} from "./evidence-envelope";

describe("EvidenceEnvelope", () => {
  it("validates canonical envelope with null vs zero preserved", () => {
    const schema = createEvidenceEnvelopeSchema(
      z.object({
        clicks: z.number().nullable(),
        impressions: z.number(),
      }),
    );

    const envelope = buildEvidenceEnvelope({
      source: "gsc",
      projectId: "proj_1",
      state: "partial",
      completeness: "partial",
      granularity: "day",
      periodStart: "2026-10-01",
      periodEnd: "2026-10-28",
      attribution: "GSC Search Analytics (final)",
      payload: { clicks: 0, impressions: 120 },
    });

    const parsed = schema.parse(envelope);
    expect(parsed.state).toBe("partial");
    expect(parsed.payload?.clicks).toBe(0);
    expect(parsed.source).toBe("gsc");
  });

  it("supports null payload when source is not configured or unavailable", () => {
    const schema = createEvidenceEnvelopeSchema(
      z.object({ value: z.number() }),
    );
    const envelope = buildEvidenceEnvelope<{ value: number }>({
      source: "crux",
      projectId: "proj_1",
      state: "insufficient_data",
      diagnosticCode: "CRUX_404_NO_DATA",
      payload: null,
    });

    const parsed = schema.parse(envelope);
    expect(parsed.payload).toBeNull();
    expect(parsed.diagnosticCode).toBe("CRUX_404_NO_DATA");
  });
});
