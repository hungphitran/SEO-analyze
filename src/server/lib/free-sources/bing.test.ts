import { describe, expect, it, vi } from "vitest";
import {
  BingWebmasterError,
  listVerifiedBingSites,
  parseBingDate,
  parseBingQueryStatsPayload,
  parseBingSitesPayload,
} from "./bing";

describe("parseBingSitesPayload", () => {
  it("returns only verified site URLs and drops verification codes", () => {
    const sites = parseBingSitesPayload({
      d: [
        {
          Url: "https://verified.example/",
          IsVerified: true,
          AuthenticationCode: "SECRET-AUTH",
          DnsVerificationCode: "secret.example.com",
        },
        {
          Url: "https://unverified.example/",
          IsVerified: false,
          AuthenticationCode: "OTHER",
        },
      ],
    });
    expect(sites).toEqual([{ url: "https://verified.example/" }]);
    expect(JSON.stringify(sites)).not.toContain("SECRET-AUTH");
  });
});

describe("parseBingQueryStatsPayload", () => {
  it("aggregates queries and can ignore rows older than the window", () => {
    const now = Date.UTC(2026, 10, 11);
    const recent = `/Date(${now})/`;
    const old = `/Date(${now - 40 * 24 * 60 * 60 * 1000})/`;
    const summary = parseBingQueryStatsPayload(
      {
        d: [
          {
            Query: "open seo",
            Clicks: 4,
            Impressions: 20,
            AvgImpressionPosition: 3,
            Date: recent,
          },
          {
            Query: "open seo",
            Clicks: 1,
            Impressions: 5,
            AvgImpressionPosition: 4,
            Date: recent,
          },
          {
            Query: "old query",
            Clicks: 50,
            Impressions: 100,
            Date: old,
          },
        ],
      },
      "https://example.com/",
      { sinceMs: now - 28 * 24 * 60 * 60 * 1000, limit: 25 },
    );
    expect(summary.queries).toEqual([
      {
        query: "open seo",
        clicks: 5,
        impressions: 25,
        avgImpressionPosition: 4,
        avgClickPosition: null,
      },
    ]);
    expect(summary.totalClicks).toBe(5);
  });
});

describe("parseBingDate", () => {
  it("reads the WCF /Date(ms)/ form", () => {
    const date = parseBingDate("/Date(1316156400000-0700)/");
    expect(date?.getTime()).toBe(1316156400000);
  });
});

describe("listVerifiedBingSites", () => {
  it("calls the JSON API and redacts the key from errors", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input);
      expect(url.pathname).toContain("/GetUserSites");
      expect(url.searchParams.get("apikey")).toBe("bing-secret");
      return new Response("nope", { status: 401 });
    });

    await expect(
      listVerifiedBingSites({
        apiKey: "bing-secret",
        fetchImpl: fetchImpl,
      }),
    ).rejects.toBeInstanceOf(BingWebmasterError);

    try {
      await listVerifiedBingSites({
        apiKey: "bing-secret",
        fetchImpl: fetchImpl,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      if (error instanceof Error) expect(error.message).not.toContain("bing-secret");
    }
  });
});
