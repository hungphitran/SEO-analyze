import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import { escapeCsvFormula, previewGeoCsvImport } from "./GeoEvidenceService";

describe("GeoEvidenceService", () => {
  it("parses Bing AI Performance CSV with UTF-8 BOM and arbitrary header order", async () => {
    const csv =
      "\uFEFFgrounding_query,citations,date,cited_url\n" +
      "best seo tool,12,2026-10-15,https://example.com/blog/seo\n" +
      "broken row,not-a-number,2026-10-15,https://example.com/a\n" +
      "other site,5,2026-10-15,https://evil-other.com/page\n";

    const preview = await previewGeoCsvImport({
      source: "bing_ai_csv",
      csvText: csv,
      projectDomain: "example.com",
    });

    expect(preview.metricType).toBe("bing_ai_citations");
    expect(preview.totalRows).toBe(3);
    expect(preview.validRows).toHaveLength(2);
    expect(preview.invalidRowCount).toBe(1);
    expect(preview.outOfScopeCount).toBe(1);
    expect(preview.validRows[0].rowFingerprint).toHaveLength(64);
  });

  it("parses Google Generative AI Performance CSV separately as google_genai_impressions", async () => {
    const csv =
      "date,page,impressions,country,device\n" +
      "2026-10-20,https://example.com/guide,340,VNM,MOBILE\n";

    const preview = await previewGeoCsvImport({
      source: "google_genai_csv",
      csvText: csv,
      projectDomain: "example.com",
    });

    expect(preview.metricType).toBe("google_genai_impressions");
    expect(preview.validRows[0].metricValue).toBe(340);
    expect(preview.validRows[0].country).toBe("VNM");
  });

  it("escapes Excel formula injection prefixes on CSV export", () => {
    expect(escapeCsvFormula("=CMD('calc')")).toBe("'=CMD('calc')");
    expect(escapeCsvFormula("+1+1")).toBe("'+1+1");
    expect(escapeCsvFormula("-2+3")).toBe("'-2+3");
    expect(escapeCsvFormula("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCsvFormula("normal text")).toBe("normal text");
  });
});
