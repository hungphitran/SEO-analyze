import { describe, expect, it } from "vitest";
import {
  canonicalDiffers,
  filterIssues,
  indexIssuesByPage,
  isAnalyzedPage,
  isOgComplete,
  issueCountsByPage,
  parseHreflang,
  summarizeIssues,
} from "@/client/features/audit/results/pageInsights";
import {
  EMPTY_PAGES_FILTERS,
  filterPages,
  type PageRow,
} from "@/client/features/audit/results/AuditResultsTableFilterLogic";
import type { AuditResultsData } from "@/client/features/audit/results/types";

type IssueRow = AuditResultsData["issues"][number];

function issue(
  id: string,
  issueType: string,
  pageId: string | null,
  severity: IssueRow["severity"] = "info",
): IssueRow {
  return {
    id,
    auditId: "a1",
    pageId,
    pageUrl: `https://site.test/${pageId}`,
    issueType,
    severity,
    detailsJson: null,
  };
}

function page(overrides: Partial<PageRow>): PageRow {
  return {
    id: "p1",
    auditId: "a1",
    url: "https://site.test/a",
    statusCode: 200,
    redirectUrl: null,
    title: "Title",
    metaDescription: "A description",
    canonicalUrl: null,
    robotsMeta: null,
    ogTitle: "t",
    ogDescription: "d",
    ogImage: "https://site.test/i.png",
    h1Count: 1,
    h2Count: 2,
    h3Count: 0,
    h4Count: 0,
    h5Count: 0,
    h6Count: 0,
    wordCount: 300,
    imagesTotal: 0,
    imagesMissingAlt: 0,
    internalLinkCount: 3,
    externalLinkCount: 1,
    hasStructuredData: false,
    isIndexable: true,
    xRobotsTag: null,
    headerCanonicalUrl: null,
    crawlDepth: 1,
    inSitemap: true,
    contentHash: null,
    fetchClass: "ok",
    responseTimeMs: 100,
    hreflangJson: null,
    htmlLang: null,
    hasViewport: null,
    twitterCard: null,
    mixedContentCount: null,
    jsonLdCount: null,
    jsonLdInvalidCount: null,
    htmlBytes: null,
    inlinkCount: null,
    ...overrides,
  } as PageRow;
}

describe("summarizeIssues", () => {
  it("counts by severity and ranks the top issue types by affected pages", () => {
    const issues = [
      issue("1", "missing-title", "p1", "critical"),
      issue("2", "missing-open-graph", "p1"),
      issue("3", "missing-open-graph", "p2"),
      issue("4", "missing-open-graph", "p3"),
      issue("5", "title-too-long", "p2", "warning"),
      issue("6", "title-too-long", "p3", "warning"),
      issue("7", "thin-content", "p3", "warning"),
      issue("8", "deep-page", "p3"),
      issue("9", "images-missing-alt", "p3", "warning"),
      issue("10", "missing-h1", "p3", "warning"),
    ];
    const summary = summarizeIssues(issues);
    expect(summary.total).toBe(10);
    expect(summary.counts.critical).toBeGreaterThanOrEqual(1);
    expect(summary.top).toHaveLength(5);
    expect(summary.top[0]).toMatchObject({
      issueType: "missing-open-graph",
      pageCount: 3,
    });
    expect(summary.top[1]).toMatchObject({
      issueType: "title-too-long",
      pageCount: 2,
    });
  });

  it("handles an empty audit", () => {
    expect(summarizeIssues([])).toEqual({
      counts: { critical: 0, warning: 0, info: 0 },
      total: 0,
      top: [],
    });
  });
});

describe("filterIssues", () => {
  const issues = [
    issue("1", "missing-title", "p1", "critical"),
    issue("2", "missing-open-graph", "p1"),
    issue("3", "missing-meta-description", "p2", "warning"),
  ];

  it("filters by registry severity and by issue type", () => {
    expect(
      filterIssues(issues, { severity: "warning", issueType: null }).map(
        (row) => row.id,
      ),
    ).toEqual(["3"]);
    expect(
      filterIssues(issues, {
        severity: "all",
        issueType: "missing-open-graph",
      }),
    ).toHaveLength(1);
    expect(
      filterIssues(issues, {
        severity: "critical",
        issueType: "title-too-long",
      }),
    ).toEqual([]);
    expect(
      filterIssues(issues, { severity: "all", issueType: null }),
    ).toHaveLength(3);
  });
});

describe("per-page indexing", () => {
  it("groups issues by page and skips site-wide ones", () => {
    const byPage = indexIssuesByPage([
      issue("1", "missing-title", "p1"),
      issue("2", "thin-content", "p1"),
      issue("3", "crawl-time-limit", null),
    ]);
    expect(Array.from(issueCountsByPage(byPage))).toEqual([["p1", 2]]);
  });
});

describe("page signal helpers", () => {
  it("detects incomplete Open Graph and a canonical pointing elsewhere", () => {
    expect(isOgComplete(page({}))).toBe(true);
    expect(isOgComplete(page({ ogImage: null }))).toBe(false);
    expect(canonicalDiffers(page({}))).toBe(false);
    expect(
      canonicalDiffers(page({ canonicalUrl: "https://site.test/a" })),
    ).toBe(false);
    expect(
      canonicalDiffers(page({ canonicalUrl: "https://site.test/b" })),
    ).toBe(true);
    expect(
      canonicalDiffers(page({ headerCanonicalUrl: "https://other.test/" })),
    ).toBe(true);
  });

  it("treats redirects and failures as not analyzed", () => {
    expect(isAnalyzedPage(page({}))).toBe(true);
    expect(isAnalyzedPage(page({ statusCode: 301 }))).toBe(false);
    expect(isAnalyzedPage(page({ fetchClass: "error" }))).toBe(false);
  });

  it("parses stored hreflang JSON defensively", () => {
    expect(parseHreflang(null)).toBeNull();
    expect(parseHreflang('["en","vi"]')).toEqual(["en", "vi"]);
    expect(parseHreflang("not json")).toBeNull();
    expect(parseHreflang('{"a":1}')).toBeNull();
  });
});

describe("filterPages with the detail filters", () => {
  const rows = [
    page({ id: "p1", url: "https://site.test/a" }),
    page({
      id: "p2",
      url: "https://site.test/b",
      isIndexable: false,
      metaDescription: "",
      ogImage: null,
      canonicalUrl: "https://site.test/a",
    }),
    page({ id: "p3", url: "https://site.test/c", statusCode: 301 }),
  ];
  const counts = new Map([["p2", 3]]);
  const ids = (filters: Partial<typeof EMPTY_PAGES_FILTERS>) =>
    filterPages(rows, { ...EMPTY_PAGES_FILTERS, ...filters }, counts).map(
      (row) => row.id,
    );

  it("filters by issue presence", () => {
    expect(ids({ hasIssues: "yes" })).toEqual(["p2"]);
    expect(ids({ hasIssues: "no" })).toEqual(["p1", "p3"]);
  });

  it("filters noindex, canonical mismatch, missing meta and missing OG", () => {
    expect(ids({ noindex: "yes" })).toEqual(["p2"]);
    expect(ids({ canonicalDiffers: "yes" })).toEqual(["p2"]);
    expect(ids({ missingMeta: "yes" })).toEqual(["p2"]);
    expect(ids({ missingOg: "yes" })).toEqual(["p2"]);
  });

  it("combines filters", () => {
    expect(ids({ noindex: "yes", hasIssues: "no" })).toEqual([]);
  });

  it("does not call a redirect's empty meta data missing", () => {
    const redirect = page({ id: "p4", statusCode: 301, metaDescription: "" });
    expect(
      filterPages([redirect], { ...EMPTY_PAGES_FILTERS, missingMeta: "yes" }),
    ).toEqual([]);
  });
});
