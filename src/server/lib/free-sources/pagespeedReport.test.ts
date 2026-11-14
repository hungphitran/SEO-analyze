import { describe, expect, it } from "vitest";
import {
  buildPagespeedReport,
  buildPagespeedSnapshotSummary,
  parseFieldBlock,
  parsePagespeedFieldData,
} from "./pagespeedReport";
import { storedLighthousePayloadSchema } from "@/server/lib/lighthouseStoredPayload";
import { readPagespeedSnapshot } from "@/shared/pagespeed-detail";

function distributions(good: number, ni: number, poor: number) {
  return [
    { min: 0, max: 1, proportion: good },
    { min: 1, max: 2, proportion: ni },
    { min: 2, proportion: poor },
  ];
}

const loadingExperience = {
  id: "https://example.com/",
  overall_category: "AVERAGE",
  metrics: {
    LARGEST_CONTENTFUL_PAINT_MS: {
      percentile: 3100,
      distributions: distributions(0.6, 0.25, 0.15),
      category: "AVERAGE",
    },
    INTERACTION_TO_NEXT_PAINT: {
      percentile: 240,
      distributions: distributions(0.7, 0.2, 0.1),
      category: "AVERAGE",
    },
    CUMULATIVE_LAYOUT_SHIFT_SCORE: {
      percentile: 5,
      distributions: distributions(0.9, 0.06, 0.04),
      category: "FAST",
    },
  },
};

const payload = {
  loadingExperience,
  originLoadingExperience: { id: "https://example.com", initial_url: "x" },
  lighthouseResult: {
    requestedUrl: "https://example.com/",
    finalUrl: "https://example.com/",
    fetchTime: "2026-11-14T01:00:00.000Z",
    lighthouseVersion: "13.0.1",
    categories: {
      performance: {
        score: 0.55,
        auditRefs: [
          { id: "unused-javascript" },
          { id: "render-blocking-insight" },
          { id: "image-delivery-insight" },
          { id: "total-byte-weight" },
          { id: "first-contentful-paint" },
        ],
      },
      accessibility: { score: 0.9, auditRefs: [] },
      "best-practices": { score: 1, auditRefs: [] },
      seo: { score: 0.8, auditRefs: [] },
    },
    audits: {
      "first-contentful-paint": {
        score: 0.4,
        scoreDisplayMode: "numeric",
        numericValue: 2800,
        displayValue: "2.8 s",
      },
      "unused-javascript": {
        title: "Reduce unused JavaScript",
        description: "Reduce [unused](https://web.dev/x) JS",
        score: 0,
        scoreDisplayMode: "metricSavings",
        numericValue: 150,
        numericUnit: "millisecond",
        details: {
          type: "opportunity",
          overallSavingsMs: 150,
          overallSavingsBytes: 29596,
          items: [{ url: "https://example.com/a.js", wastedBytes: 29596 }],
        },
      },
      "render-blocking-insight": {
        title: "Render blocking requests",
        score: 0,
        scoreDisplayMode: "metricSavings",
        numericValue: 1279,
        numericUnit: "millisecond",
        details: {
          type: "table",
          items: [{ url: "https://example.com/a.css" }],
        },
      },
      "image-delivery-insight": {
        title: "Improve image delivery",
        score: 0.5,
        scoreDisplayMode: "metricSavings",
        numericValue: 2212150,
        numericUnit: "byte",
        details: {
          type: "table",
          items: [
            {
              url: "https://example.com/hero.png",
              node: { nodeLabel: "Hero", snippet: "<img>" },
            },
          ],
        },
      },
      "total-byte-weight": {
        title: "Avoids enormous network payloads",
        score: 0.5,
        scoreDisplayMode: "metricSavings",
        numericValue: 4106638,
        numericUnit: "byte",
        details: { type: "table", items: [] },
      },
    },
  },
};

describe("parseFieldBlock", () => {
  it("maps p75 and the good / needs-improvement / poor distribution", () => {
    const block = parseFieldBlock(loadingExperience);
    expect(block?.overall).toBe("AVERAGE");
    expect(block?.metrics.lcp).toEqual({
      p75: 3100,
      good: 0.6,
      needsImprovement: 0.25,
      poor: 0.15,
    });
    expect(block?.metrics.inp?.p75).toBe(240);
  });

  it("divides PSI's CLS percentile by 100", () => {
    expect(parseFieldBlock(loadingExperience)?.metrics.cls?.p75).toBe(0.05);
  });

  it("returns null when Google had no real-user metrics", () => {
    expect(parseFieldBlock({ initial_url: "https://a.com/" })).toBeNull();
    expect(parseFieldBlock({ metrics: {} })).toBeNull();
    expect(parseFieldBlock(undefined)).toBeNull();
  });

  it("keeps URL and origin separate", () => {
    const data = parsePagespeedFieldData(payload);
    expect(data.url).not.toBeNull();
    expect(data.origin).toBeNull();
  });
});

describe("buildPagespeedReport", () => {
  const report = buildPagespeedReport({
    payload,
    url: "https://example.com/",
    strategy: "mobile",
  });

  it("produces a payload the stored-payload schema accepts", () => {
    expect(storedLighthousePayloadSchema.safeParse(report).success).toBe(true);
    expect(report.source).toBe("pagespeed-insights");
    expect(report.metadata.lighthouseVersion).toBe("13.0.1");
    expect(report.scores).toEqual({
      performance: 55,
      accessibility: 90,
      "best-practices": 100,
      seo: 80,
    });
  });

  it("reads savings from opportunity details and from insight numericValue", () => {
    const byKey = Object.fromEntries(
      report.issues.map((issue) => [issue.auditKey, issue]),
    );
    expect(byKey["unused-javascript"]).toMatchObject({
      impactMs: 150,
      impactBytes: 29596,
    });
    expect(byKey["render-blocking-insight"]).toMatchObject({
      impactMs: 1279,
      impactBytes: null,
    });
    expect(byKey["image-delivery-insight"]).toMatchObject({
      impactMs: null,
      impactBytes: 2212150,
    });
  });

  it("does not turn a plain total (total-byte-weight) into a saving", () => {
    const issue = report.issues.find(
      (item) => item.auditKey === "total-byte-weight",
    );
    expect(issue?.impactBytes).toBeNull();
  });

  it("lifts the nested node label out of insight items", () => {
    const issue = report.issues.find(
      (item) => item.auditKey === "image-delivery-insight",
    );
    expect(issue?.items[0]).toContain("Hero");
  });

  it("uses real-user INP when the lab run has none", () => {
    expect(report.metrics.interactionToNextPaint.numericValue).toBe(240);
    expect(report.metrics.firstContentfulPaint.displayValue).toBe("2.8 s");
  });

  it("returns an empty but valid report for an empty payload", () => {
    const empty = buildPagespeedReport({
      payload: {},
      url: "https://example.com/",
      strategy: "desktop",
      now: new Date("2026-11-14T00:00:00.000Z"),
    });
    expect(storedLighthousePayloadSchema.safeParse(empty).success).toBe(true);
    expect(empty.issues).toEqual([]);
    expect(empty.fieldData).toEqual({ url: null, origin: null });
    expect(empty.metadata.fetchedAt).toBe("2026-11-14T00:00:00.000Z");
  });
});

describe("snapshot summary", () => {
  const report = buildPagespeedReport({
    payload,
    url: "https://example.com/",
    strategy: "mobile",
  });

  it("keeps each strategy's detail and its own error", () => {
    const summary = buildPagespeedSnapshotSummary({
      url: "https://example.com/",
      mobile: { status: "fulfilled", value: { report } },
      desktop: {
        status: "rejected",
        reason: new Error("HTTP 429 key=secret-key"),
      },
      apiKey: "secret-key",
    });
    expect(summary.desktop).toBeNull();
    expect(summary.desktopError).not.toContain("secret-key");
    const view = readPagespeedSnapshot(JSON.parse(JSON.stringify(summary)));
    expect(view?.mobile?.scores.performance).toBe(55);
    expect(view?.mobile?.issueCount).toBe(report.issues.length);
    expect(view?.desktop).toBeNull();
    expect(view?.desktopError).toContain("429");
  });
});
