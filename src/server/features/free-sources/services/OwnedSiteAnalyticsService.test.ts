import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import {
  aggregateSameGrainFacts,
  buildFactGrainKey,
  normalizePageUrl,
} from "./OwnedSiteAnalyticsService";

describe("OwnedSiteAnalyticsService", () => {
  it("normalizes page URLs consistently while preserving query strings", () => {
    expect(normalizePageUrl("https://Example.COM:443/blog/post/?utm=1")).toBe(
      "https://example.com/blog/post?utm=1",
    );
    expect(normalizePageUrl("https://example.com/")).toBe(
      "https://example.com/",
    );
    expect(normalizePageUrl("(not set)")).toBeNull();
  });

  it("builds deterministic grain keys so distinct grains never collide", () => {
    const k1 = buildFactGrainKey({
      propertyId: "sc-domain:example.com",
      factDate: "2026-10-01",
      grainType: "query_page",
      query: "seo tool",
      normalizedUrl: "https://example.com/a",
    });
    const k2 = buildFactGrainKey({
      propertyId: "sc-domain:example.com",
      factDate: "2026-10-01",
      grainType: "query_page",
      query: "seo tool",
      normalizedUrl: "https://example.com/b",
    });
    expect(k1).not.toBe(k2);
  });

  it("aggregates same-grain facts using sum(clicks)/sum(impressions) and impression-weighted position", () => {
    const agg = aggregateSameGrainFacts([
      {
        clicks: 10,
        impressions: 100,
        averagePosition: 5,
        organicSessions: null,
        keyEvents: null,
      },
      {
        clicks: 30,
        impressions: 900,
        averagePosition: 10,
        organicSessions: null,
        keyEvents: null,
      },
    ]);

    expect(agg.clicks).toBe(40);
    expect(agg.impressions).toBe(1000);
    expect(agg.ctr).toBeCloseTo(0.04, 6);
    // Weighted position: (5*100 + 10*900) / 1000 = 9.5
    expect(agg.averagePosition).toBeCloseTo(9.5, 6);
    expect(agg.organicSessions).toBeNull();
  });

  it("returns null metrics instead of fake zeros when no rows exist", () => {
    const agg = aggregateSameGrainFacts([]);
    expect(agg.clicks).toBeNull();
    expect(agg.impressions).toBeNull();
    expect(agg.ctr).toBeNull();
    expect(agg.averagePosition).toBeNull();
  });
});
