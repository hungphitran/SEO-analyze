import { describe, expect, it } from "vitest";
import {
  formatCruxValue,
  formatOpenPageRankScore,
  rateCruxMetric,
} from "./real-user-signals";

describe("rateCruxMetric", () => {
  it("uses the official Core Web Vitals thresholds", () => {
    expect(rateCruxMetric("lcp", 2500)).toBe("good");
    expect(rateCruxMetric("lcp", 2501)).toBe("needs-improvement");
    expect(rateCruxMetric("lcp", 4001)).toBe("poor");
    expect(rateCruxMetric("inp", 200)).toBe("good");
    expect(rateCruxMetric("inp", 501)).toBe("poor");
    expect(rateCruxMetric("cls", 0.1)).toBe("good");
    expect(rateCruxMetric("cls", 0.25)).toBe("needs-improvement");
    expect(rateCruxMetric("cls", 0.26)).toBe("poor");
  });

  it("does not rate a missing value", () => {
    expect(rateCruxMetric("lcp", null)).toBeNull();
    expect(rateCruxMetric("lcp", Number.NaN)).toBeNull();
  });
});

describe("formatCruxValue", () => {
  it("formats times, CLS and gaps", () => {
    expect(formatCruxValue("lcp", 2400)).toBe("2.4 s");
    expect(formatCruxValue("lcp", 640)).toBe("640 ms");
    expect(formatCruxValue("inp", 1200)).toBe("1200 ms");
    expect(formatCruxValue("cls", 0.054)).toBe("0.05");
    expect(formatCruxValue("ttfb", null)).toBe("—");
  });
});

describe("formatOpenPageRankScore", () => {
  it("drops trailing zeros", () => {
    expect(formatOpenPageRankScore(10)).toBe("10");
    expect(formatOpenPageRankScore(4.9)).toBe("4.9");
    expect(formatOpenPageRankScore(9.6712)).toBe("9.67");
  });
});
