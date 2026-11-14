import { describe, expect, it } from "vitest";
import { toUrlInspectionView } from "./urlInspection";

describe("toUrlInspectionView", () => {
  it("maps index status, canonical mismatch, mobile and rich results", () => {
    const view = toUrlInspectionView({
      inspectionResultLink: "https://search.google.com/x",
      indexStatusResult: {
        verdict: "PASS",
        coverageState: "Submitted and indexed",
        indexingState: "INDEXING_ALLOWED",
        robotsTxtState: "ALLOWED",
        pageFetchState: "SUCCESSFUL",
        lastCrawlTime: "2026-11-10T01:00:00Z",
        crawledAs: "MOBILE",
        googleCanonical: "https://a.com/a",
        userCanonical: "https://a.com/b",
        sitemap: ["https://a.com/sitemap.xml"],
        referringUrls: Array.from(
          { length: 15 },
          (_, i) => `https://a.com/${i}`,
        ),
      },
      mobileUsabilityResult: {
        verdict: "FAIL",
        issues: [{ issueType: "TAP_TARGETS_TOO_CLOSE", severity: "WARNING" }],
      },
      richResultsResult: {
        verdict: "PASS",
        detectedItems: [
          {
            richResultType: "Breadcrumbs",
            items: [
              {
                name: "Breadcrumb",
                issues: [{ issueMessage: "Missing field", severity: "ERROR" }],
              },
            ],
          },
        ],
      },
    });
    expect(view.verdict).toBe("PASS");
    expect(view.canonicalMismatch).toBe(true);
    expect(view.referringUrls).toHaveLength(10);
    expect(view.mobileUsability?.issues).toEqual([
      { message: "TAP_TARGETS_TOO_CLOSE", severity: "WARNING" },
    ]);
    expect(view.richResults?.items[0]).toEqual({
      type: "Breadcrumbs",
      names: ["Breadcrumb"],
      issues: [{ message: "Missing field", severity: "ERROR" }],
    });
    expect(view.amp).toBeNull();
    expect(view.reportLink).toBe("https://search.google.com/x");
  });

  it("returns nulls and empty lists for an empty result", () => {
    const view = toUrlInspectionView({});
    expect(view.verdict).toBeNull();
    expect(view.canonicalMismatch).toBe(false);
    expect(view.sitemaps).toEqual([]);
    expect(view.mobileUsability).toBeNull();
    expect(view.richResults).toBeNull();
  });

  it("does not flag a mismatch when only one canonical is known", () => {
    expect(
      toUrlInspectionView({
        indexStatusResult: { googleCanonical: "https://a.com/" },
      }).canonicalMismatch,
    ).toBe(false);
  });
});
