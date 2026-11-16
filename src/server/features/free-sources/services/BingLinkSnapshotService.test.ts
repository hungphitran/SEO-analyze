import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import { diffBingLinkBatches } from "./BingLinkSnapshotService";

describe("BingLinkSnapshotService", () => {
  it("computes discovered and lost links between observed Bing batches with scope caveat", () => {
    const diff = diffBingLinkBatches(
      [
        {
          targetUrl: "https://example.com/a",
          referringDomain: "news.example.org",
          referringUrl: "https://news.example.org/post",
          anchorText: "seo guide",
          linkCount: 1,
        },
        {
          targetUrl: "https://example.com/b",
          referringDomain: "blog.example.net",
          referringUrl: null,
          anchorText: null,
          linkCount: 2,
        },
      ],
      [
        {
          targetUrl: "https://example.com/a",
          referringDomain: "news.example.org",
          referringUrl: "https://news.example.org/post",
          anchorText: "seo guide",
          linkCount: 1,
        },
        {
          targetUrl: "https://example.com/old",
          referringDomain: "old.example.org",
          referringUrl: null,
          anchorText: null,
          linkCount: 1,
        },
      ],
      "batch_2",
      "batch_1",
    );

    expect(diff.scopeNote).toContain("Bing observed sample");
    expect(diff.unchangedCount).toBe(1);
    expect(diff.discovered).toHaveLength(1);
    expect(diff.discovered[0].referringDomain).toBe("blog.example.net");
    expect(diff.lost).toHaveLength(1);
    expect(diff.lost[0].referringDomain).toBe("old.example.org");
  });
});
