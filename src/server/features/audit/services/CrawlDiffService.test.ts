import { describe, expect, it } from "vitest";
import { diffCrawlSnapshots } from "@/server/features/audit/services/CrawlDiffService";

describe("CrawlDiffService", () => {
  it("detects 200->404, noindex appeared, canonical change, and orphan candidates", () => {
    const diff = diffCrawlSnapshots({
      previousComplete: true,
      currentComplete: true,
      previousPages: [
        {
          url: "https://example.com/a",
          statusCode: 200,
          redirectUrl: null,
          title: "Page A",
          metaDescription: "Desc A",
          canonicalUrl: "https://example.com/a",
          isIndexable: true,
          inlinkCount: 3,
          inSitemap: true,
        },
        {
          url: "https://example.com/deleted",
          statusCode: 200,
          redirectUrl: null,
          title: "Old",
          metaDescription: null,
          canonicalUrl: null,
          isIndexable: true,
          inlinkCount: 1,
          inSitemap: false,
        },
      ],
      currentPages: [
        {
          url: "https://example.com/a",
          statusCode: 404,
          redirectUrl: null,
          title: "Page A",
          metaDescription: "Desc A",
          canonicalUrl: "https://other-site.com/a",
          isIndexable: false,
          inlinkCount: 0,
          inSitemap: true,
        },
      ],
      gscKnownUrls: ["https://example.com/orphan-gsc"],
    });

    const changeTypes = diff.changes.map((c) => c.changeType);
    expect(changeTypes).toContain("status_changed");
    expect(changeTypes).toContain("noindex_appeared");
    expect(changeTypes).toContain("canonical_changed");
    expect(changeTypes).toContain("internal_links_changed");
    expect(changeTypes).toContain("removed_url");
    expect(diff.orphanCandidates.map((o) => o.url)).toEqual([
      "https://example.com/a",
      "https://example.com/orphan-gsc",
    ]);
  });

  it("never reports false removed_url when current crawl is incomplete", () => {
    const diff = diffCrawlSnapshots({
      previousComplete: true,
      currentComplete: false,
      previousPages: [
        {
          url: "https://example.com/a",
          statusCode: 200,
          redirectUrl: null,
          title: "A",
          metaDescription: null,
          canonicalUrl: null,
          isIndexable: true,
          inlinkCount: 2,
          inSitemap: true,
        },
        {
          url: "https://example.com/b",
          statusCode: 200,
          redirectUrl: null,
          title: "B",
          metaDescription: null,
          canonicalUrl: null,
          isIndexable: true,
          inlinkCount: 2,
          inSitemap: true,
        },
      ],
      currentPages: [
        {
          url: "https://example.com/a",
          statusCode: 200,
          redirectUrl: null,
          title: "A",
          metaDescription: null,
          canonicalUrl: null,
          isIndexable: true,
          inlinkCount: 2,
          inSitemap: true,
        },
      ],
    });

    expect(diff.incompleteWarning).not.toBeNull();
    expect(diff.changes.some((c) => c.changeType === "removed_url")).toBe(
      false,
    );
  });
});
