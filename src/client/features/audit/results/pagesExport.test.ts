import { describe, expect, it } from "vitest";
import { buildPagesExport } from "@/client/features/audit/results/pagesExport";
import type { AuditResultsData } from "@/client/features/audit/results/types";

type PageRow = AuditResultsData["pages"][number];
type IssueRow = AuditResultsData["issues"][number];

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- fixture lists only the fields the export reads
const page = {
  id: "p1",
  url: "https://site.test/a",
  statusCode: 200,
  redirectUrl: null,
  title: "Title",
  metaDescription: "Desc",
  canonicalUrl: "https://site.test/b",
  headerCanonicalUrl: null,
  robotsMeta: null,
  xRobotsTag: null,
  ogTitle: "t",
  ogDescription: "d",
  ogImage: null,
  twitterCard: "summary",
  h1Count: 1,
  h2Count: 2,
  h3Count: 0,
  h4Count: 0,
  h5Count: 0,
  h6Count: 0,
  wordCount: 120,
  imagesTotal: 4,
  imagesMissingAlt: 1,
  internalLinkCount: 5,
  externalLinkCount: 2,
  inlinkCount: 3,
  crawlDepth: 1,
  inSitemap: true,
  isIndexable: true,
  htmlLang: "vi",
  hasViewport: true,
  jsonLdCount: 2,
  jsonLdInvalidCount: 1,
  mixedContentCount: 0,
  hreflangJson: '["en","vi"]',
  htmlBytes: 2048,
  responseTimeMs: 150,
} as PageRow;

const oldAuditPage = {
  ...page,
  id: "p2",
  inlinkCount: null,
  hasViewport: null,
  htmlLang: null,
  hreflangJson: null,
  htmlBytes: null,
} as PageRow;

function issue(id: string, issueType: string): IssueRow {
  return {
    id,
    auditId: "a1",
    pageId: "p1",
    pageUrl: "https://site.test/a",
    issueType,
    severity: "warning",
    detailsJson: null,
  };
}

const issues = [
  issue("i1", "missing-open-graph"),
  issue("i2", "missing-open-graph"),
  issue("i3", "invalid-json-ld"),
];

describe("buildPagesExport", () => {
  const table = buildPagesExport([page, oldAuditPage], issues);

  it("keeps headers, rows and records aligned", () => {
    expect(table.rows[0]).toHaveLength(table.headers.length);
    expect(Object.keys(table.records[0])).toHaveLength(table.headers.length);
    expect(table.headers.length).toBeGreaterThan(30);
  });

  it("exports the new per-page data, not just the original 8 columns", () => {
    const record = table.records[0];
    expect(record).toMatchObject({
      url: "https://site.test/a",
      issueCount: 3,
      canonical: "https://site.test/b",
      ogComplete: "no",
      inlinkCount: 3,
      htmlLang: "vi",
      hasViewport: "yes",
      jsonLdInvalidCount: 1,
      hreflang: "en; vi",
      htmlBytes: 2048,
    });
    expect(String(record.issueTypes).split("; ")).toHaveLength(2);
  });

  it("leaves fields blank for audits crawled before they existed", () => {
    expect(table.records[1]).toMatchObject({
      inlinkCount: "",
      hasViewport: "",
      htmlLang: "",
      hreflang: "",
      htmlBytes: "",
      issueCount: 0,
    });
  });
});
