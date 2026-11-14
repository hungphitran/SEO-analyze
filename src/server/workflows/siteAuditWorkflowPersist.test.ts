import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CrawledPageResult, PageLink } from "@/server/lib/audit/types";

const mocks = vi.hoisted(() => ({
  insertCrawledBatch: vi.fn(),
  updateAuditProgress: vi.fn(),
  pushCrawledUrls: vi.fn(),
}));
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: {
    insertCrawledBatch: mocks.insertCrawledBatch,
    updateAuditProgress: mocks.updateAuditProgress,
  },
}));
vi.mock("@/server/lib/audit/progress-kv", () => ({
  AuditProgressKV: { pushCrawledUrls: mocks.pushCrawledUrls },
}));

import { persistCrawledPages } from "@/server/workflows/siteAuditWorkflowPersist";

const link = (targetUrl: string, isInternal: boolean): PageLink => ({
  targetUrl,
  anchor: null,
  isInternal,
  isNofollow: false,
});

function page(links: PageLink[]): CrawledPageResult {
  return {
    id: "p1",
    url: "https://site.test/",
    statusCode: 200,
    fetchClass: "ok",
    redirectUrl: null,
    title: "Home",
    metaDescription: "",
    canonicalUrl: null,
    robotsMeta: null,
    xRobotsTag: null,
    headerCanonicalUrl: null,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    h1Count: 1,
    h2Count: 0,
    h3Count: 0,
    h4Count: 0,
    h5Count: 0,
    h6Count: 0,
    headingOrder: [1],
    wordCount: 300,
    contentHash: null,
    isHtml: true,
    htmlBytes: 1000,
    rateLimited: false,
    imagesTotal: 0,
    imagesMissingAlt: 0,
    images: [],
    links,
    hasStructuredData: false,
    hreflangTags: [],
    isIndexable: true,
    responseTimeMs: 100,
    crawlDepth: 0,
    inSitemap: false,
  };
}

describe("persistCrawledPages external links", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records safe external targets separately from internal links", async () => {
    const recordBatch = vi
      .fn()
      .mockResolvedValue({ attempted: 1, pending: 0, seen: 1 });
    await persistCrawledPages({
      auditId: "a1",
      workflowInstanceId: "w1",
      origin: "https://site.test",
      robots: { isAllowed: () => true } as never,
      sitePlatform: undefined,
      scratchpad: { recordBatch } as never,
      pages: [
        page([
          link("https://site.test/about", true),
          link("https://other.test/a", false),
          link("http://127.0.0.1/admin", false),
        ]),
      ],
      depthByUrl: new Map([["https://site.test/", 0]]),
      maxPages: 50,
    });
    const batch = recordBatch.mock.calls[0][0];
    expect(batch.links).toEqual([
      {
        pageId: expect.any(String),
        url: "https://site.test/",
        targets: ["https://site.test/about"],
      },
    ]);
    expect(batch.externalLinks).toEqual([
      {
        pageId: expect.any(String),
        url: "https://site.test/",
        targets: ["https://other.test/a"],
      },
    ]);
  });

  it("caps external targets per page", async () => {
    const recordBatch = vi
      .fn()
      .mockResolvedValue({ attempted: 1, pending: 0, seen: 1 });
    const many = Array.from({ length: 60 }, (_, i) =>
      link(`https://other.test/${i}`, false),
    );
    await persistCrawledPages({
      auditId: "a1",
      workflowInstanceId: "w1",
      origin: "https://site.test",
      robots: { isAllowed: () => true } as never,
      sitePlatform: undefined,
      scratchpad: { recordBatch } as never,
      pages: [page(many)],
      depthByUrl: new Map(),
      maxPages: 50,
    });
    expect(recordBatch.mock.calls[0][0].externalLinks[0].targets).toHaveLength(
      25,
    );
  });
});
