import { describe, expect, it, vi } from "vitest";
import {
  getBingCrawlIssues,
  getBingLinkCounts,
  getBingPageStats,
  parseBingCrawlIssuesPayload,
  parseBingLinkCountsPayload,
  parseBingPageStatsPayload,
} from "./bing-extended";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("Bing Webmaster extended endpoints", () => {
  const KEY = "bing-secret-key-0123456789";

  it("parses GetPageStats rows with Query or Url field and aggregates by URL", () => {
    const now = Date.UTC(2026, 10, 11);
    const recent = `/Date(${now})/`;
    const old = `/Date(${now - 40 * 24 * 60 * 60 * 1000})/`;
    const summary = parseBingPageStatsPayload(
      {
        d: [
          {
            Query: "https://example.com/a",
            Clicks: 10,
            Impressions: 100,
            AvgImpressionPosition: 2,
            Date: recent,
          },
          {
            Url: "https://example.com/a",
            Clicks: 5,
            Impressions: 20,
            AvgImpressionPosition: 3,
            Date: recent,
          },
          {
            Url: "https://example.com/old",
            Clicks: 99,
            Impressions: 200,
            Date: old,
          },
        ],
      },
      "https://example.com/",
      { sinceMs: now - 28 * 24 * 60 * 60 * 1000, limit: 25 },
    );

    expect(summary).toEqual({
      siteUrl: "https://example.com/",
      pageCount: 1,
      pages: [
        {
          url: "https://example.com/a",
          clicks: 15,
          impressions: 120,
          avgImpressionPosition: 3,
          avgClickPosition: null,
        },
      ],
    });
  });

  it("parses GetLinkCounts from either array d or d.Links and sorts by count", () => {
    const summary = parseBingLinkCountsPayload(
      {
        d: {
          Links: [
            { Url: "https://example.com/low", Count: 2 },
            { TargetUrl: "https://example.com/high", LinkCount: 15 },
          ],
        },
      },
      "https://example.com/",
      { limit: 1 },
    );
    expect(summary).toEqual({
      siteUrl: "https://example.com/",
      totalLinks: 17,
      links: [{ url: "https://example.com/high", count: 15 }],
    });
  });

  it("parses GetCrawlIssues rows cleanly", () => {
    const summary = parseBingCrawlIssuesPayload(
      {
        d: [
          {
            Url: "https://example.com/broken",
            HttpCode: 404,
            Issues: "NotFound",
            InLinks: 3,
          },
          { Url: "", HttpCode: 500, Issues: "Ignored", InLinks: 0 },
        ],
      },
      "https://example.com/",
    );
    expect(summary).toEqual({
      siteUrl: "https://example.com/",
      issueCount: 1,
      items: [
        {
          url: "https://example.com/broken",
          httpCode: 404,
          issues: "NotFound",
          inLinks: 3,
        },
      ],
    });
  });

  it("calls GetPageStats, GetLinkCounts, and GetCrawlIssues endpoints", async () => {
    const seenPaths: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input);
      seenPaths.push(url.pathname);
      return json({ d: [] });
    });

    await getBingPageStats({
      apiKey: KEY,
      siteUrl: "https://example.com/",
      fetchImpl,
    });
    await getBingLinkCounts({
      apiKey: KEY,
      siteUrl: "https://example.com/",
      fetchImpl,
    });
    await getBingCrawlIssues({
      apiKey: KEY,
      siteUrl: "https://example.com/",
      fetchImpl,
    });

    expect(seenPaths).toEqual([
      "/webmaster/api.svc/json/GetPageStats",
      "/webmaster/api.svc/json/GetLinkCounts",
      "/webmaster/api.svc/json/GetCrawlIssues",
    ]);
  });
});
