import { sort } from "remeda";
import { describe, expect, it } from "vitest";
import { verdictTone } from "./inspectionVerdict";
import {
  dimensionExportSlug,
  formatDimensionKey,
  isPropertyTab,
  tableDimensionForTab,
} from "./searchPerformanceTabs";
import {
  SEARCH_PERFORMANCE_TABLE_DIMENSIONS,
  SEARCH_PERFORMANCE_TABS,
} from "@/types/schemas/search-performance";

const byName = (a: string, b: string) => a.localeCompare(b);

describe("tab to dimension mapping", () => {
  it("maps every dimension from exactly one tab", () => {
    const mapped = SEARCH_PERFORMANCE_TABS.map(tableDimensionForTab).filter(
      (dimension) => dimension !== null,
    );
    expect(sort(mapped, byName)).toEqual(
      sort([...SEARCH_PERFORMANCE_TABLE_DIMENSIONS], byName),
    );
  });

  it("treats sitemaps and inspection as property tabs, not tables", () => {
    for (const tab of ["sitemaps", "inspection"] as const) {
      expect(isPropertyTab(tab)).toBe(true);
      expect(tableDimensionForTab(tab)).toBeNull();
    }
    expect(isPropertyTab("queries")).toBe(false);
    expect(tableDimensionForTab("striking")).toBeNull();
  });

  it("gives each dimension a distinct export file name", () => {
    const slugs = SEARCH_PERFORMANCE_TABLE_DIMENSIONS.map(dimensionExportSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("formatDimensionKey", () => {
  it("shows country codes upper-case and devices in Vietnamese", () => {
    expect(formatDimensionKey("country", "vnm")).toBe("VNM");
    expect(formatDimensionKey("device", "MOBILE")).toBe("Di động");
    expect(formatDimensionKey("device", "SMART_TV")).toBe("SMART_TV");
  });

  it("humanizes search appearance enums and leaves dates and queries alone", () => {
    expect(formatDimensionKey("searchAppearance", "AMP_BLUE_LINK")).toBe(
      "AMP blue link",
    );
    expect(formatDimensionKey("searchAppearance", "RICH_RESULT")).toBe(
      "Rich result",
    );
    expect(formatDimensionKey("date", "2026-11-01")).toBe("2026-11-01");
    expect(formatDimensionKey("query", "Giày Nam")).toBe("Giày Nam");
  });
});

describe("verdictTone", () => {
  it("maps URL Inspection verdicts", () => {
    expect(verdictTone("PASS")).toBe("good");
    expect(verdictTone("PARTIAL")).toBe("warn");
    expect(verdictTone("FAIL")).toBe("bad");
    expect(verdictTone("NEUTRAL")).toBe("neutral");
    expect(verdictTone(null)).toBe("neutral");
  });
});
