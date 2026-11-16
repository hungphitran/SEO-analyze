import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import {
  classifyKeywordIntent,
  clusterQueriesByRules,
} from "./KeywordClusteringService";
import { detectKeywordOpportunities } from "./KeywordOpportunityService";

describe("KeywordOpportunityService", () => {
  it("detects near-top, CTR gap against site baseline, decaying, growing, and cannibalization", () => {
    const ops = detectKeywordOpportunities([
      // Bucket 4-10 has 3+ queries so CTR baseline is computed from site's own data
      {
        query: "seo audit tool",
        targetUrl: "https://example.com/audit",
        clicks: 50,
        impressions: 1000,
        ctr: 0.05,
        averagePosition: 5,
        previousImpressions: 900,
      },
      {
        query: "free seo checker",
        targetUrl: "https://example.com/checker",
        clicks: 60,
        impressions: 1000,
        ctr: 0.06,
        averagePosition: 6,
        previousImpressions: 1000,
      },
      {
        query: "technical seo guide",
        targetUrl: "https://example.com/guide",
        clicks: 10,
        impressions: 2000,
        ctr: 0.005, // way below site baseline (~3.8%)
        averagePosition: 7,
        previousImpressions: 3500, // decaying
      },
      {
        query: "technical seo guide",
        targetUrl: "https://example.com/guide-v2",
        clicks: 5,
        impressions: 500,
        ctr: 0.01,
        averagePosition: 12,
        previousImpressions: 100, // growing
      },
    ]);

    const rules = new Set(ops.map((o) => o.rule));
    expect(rules.has("ctr_opportunity")).toBe(true);
    expect(rules.has("near_top")).toBe(true);
    expect(rules.has("decaying")).toBe(true);
    expect(rules.has("growing")).toBe(true);
    expect(rules.has("cannibalization")).toBe(true);

    for (const op of ops) {
      expect(op.scoreVersion).toBe("v1.0");
      expect(op.whySuggested.length).toBeGreaterThan(10);
      expect(op.score).not.toBeNull();
    }
  });

  it("clusters Vietnamese queries with and without diacritics deterministically", () => {
    const clusters = clusterQueriesByRules([
      { query: "công cụ kiểm tra seo", source: "gsc" },
      { query: "cong cu kiem tra seo mien phi", source: "gsc" },
      { query: "mua gói seo giá rẻ", source: "gsc" },
    ]);

    expect(clusters.length).toBeGreaterThanOrEqual(2);
    expect(classifyKeywordIntent("mua gói seo giá rẻ")).toBe("transactional");
    expect(classifyKeywordIntent("cách làm seo là gì")).toBe("informational");
    expect(classifyKeywordIntent("so sánh công cụ seo tốt nhất")).toBe("commercial");
  });
});
