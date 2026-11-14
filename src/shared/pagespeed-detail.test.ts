import { describe, expect, it } from "vitest";
import { readPagespeedSnapshot, toSnapshotDetail } from "./pagespeed-detail";

const metric = { score: null, displayValue: null, numericValue: null };
const metrics = {
  firstContentfulPaint: metric,
  largestContentfulPaint: metric,
  totalBlockingTime: metric,
  cumulativeLayoutShift: metric,
  speedIndex: metric,
  timeToInteractive: metric,
  interactionToNextPaint: metric,
  serverResponseTime: metric,
};

function issue(index: number) {
  return {
    category: "performance" as const,
    auditKey: `audit-${index}`,
    title: `Audit ${index}`,
    description: "d".repeat(500),
    score: 0,
    scoreDisplayMode: "binary",
    displayValue: null,
    impactMs: index,
    impactBytes: null,
    severity: "info" as const,
    items: ["x".repeat(400), "b", "c", "d", "e"],
  };
}

describe("toSnapshotDetail", () => {
  it("caps issues, items and text but keeps the total count", () => {
    const detail = toSnapshotDetail({
      metadata: {
        fetchedAt: "2026-11-14T00:00:00.000Z",
        lighthouseVersion: "13",
      },
      scores: {
        performance: 1,
        accessibility: 2,
        "best-practices": 3,
        seo: 4,
      },
      metrics,
      issues: Array.from({ length: 40 }, (_, index) => issue(index)),
    });
    expect(detail.issues).toHaveLength(15);
    expect(detail.issueCount).toBe(40);
    expect(detail.issues[0]?.items).toHaveLength(3);
    expect(detail.issues[0]?.description.length).toBeLessThanOrEqual(220);
    expect(detail.fieldData).toEqual({ url: null, origin: null });
  });
});

describe("readPagespeedSnapshot", () => {
  it("returns null for junk and for an empty summary", () => {
    expect(readPagespeedSnapshot(null)).toBeNull();
    expect(readPagespeedSnapshot("x")).toBeNull();
    expect(readPagespeedSnapshot({})).toBeNull();
  });

  it("reads an old scores-only snapshot as legacy", () => {
    const view = readPagespeedSnapshot({
      url: "https://a.com/",
      mobile: {
        performanceScore: 71,
        accessibilityScore: 80,
        bestPracticesScore: 90,
        seoScore: 100,
      },
    });
    expect(view?.legacy).toBe(true);
    expect(view?.mobile?.scores.performance).toBe(71);
    expect(view?.desktop).toBeNull();
  });

  it("shows a failed refresh as errors without detail", () => {
    const view = readPagespeedSnapshot({
      url: "https://a.com/",
      mobile: null,
      desktop: null,
      mobileError: "quota",
      desktopError: "quota",
    });
    expect(view).toMatchObject({
      mobile: null,
      mobileError: "quota",
      legacy: false,
    });
  });
});
