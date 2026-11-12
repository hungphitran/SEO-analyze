import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  OPEN_PAGERANK_ENDPOINT,
  OpenPageRankError,
  SlidingWindowRateLimiter,
  lookupOpenPageRank,
  normalizeHostname,
  parseOpenPageRankPayload,
} from "./open-pagerank";

const payload = {
  as_of: "2026-10-01",
  count: 2,
  results: [
    {
      domain: "github.com",
      found: true,
      open_page_rank: 9.67,
      rank: 30,
      referring_domains: 282833,
      hosts: [
        {
          host: "pages.github.com",
          found: true,
          open_page_rank: 9.15,
          rank: 1954,
        },
      ],
    },
    { domain: "example.org", found: false, open_page_rank: null, rank: null },
  ],
  invalid: [],
};

type FetchMock = { mock: { calls: unknown[][] } };

/** The URL, headers and parsed JSON body of the n-th recorded call. */
function sentRequest(fetchImpl: FetchMock, index = 0) {
  const [url, init] = fetchImpl.mock.calls[index] ?? [];
  const requestInit = z
    .object({ headers: z.unknown(), body: z.string() })
    .parse(init);
  return {
    url: String(url),
    headers: new Headers(
      z.record(z.string(), z.string()).parse(requestInit.headers),
    ),
    body: z.record(z.string(), z.unknown()).parse(JSON.parse(requestInit.body)),
  };
}

async function failure(promise: Promise<unknown>): Promise<OpenPageRankError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof OpenPageRankError) return error;
    throw error;
  }
  throw new Error("expected the lookup to fail");
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

describe("normalizeHostname", () => {
  it("lowercases and drops www, port and trailing dot", () => {
    expect(normalizeHostname(" WWW.Example.com. ")).toBe("example.com");
    expect(normalizeHostname("blog.example.com:443")).toBe("blog.example.com");
  });
});

describe("parseOpenPageRankPayload", () => {
  it("maps the root domain and a queried subdomain", () => {
    const { entries, asOf } = parseOpenPageRankPayload(payload, [
      "github.com",
      "pages.github.com",
      "example.org",
      "missing.dev",
    ]);
    expect(asOf).toBe("2026-10-01");
    expect(entries.get("github.com")).toMatchObject({
      domain: "github.com",
      score: 9.67,
      rank: 30,
      referringDomains: 282833,
      host: null,
    });
    expect(entries.get("pages.github.com")?.host).toEqual({
      name: "pages.github.com",
      score: 9.15,
      rank: 1954,
    });
    expect(entries.get("example.org")).toBeNull();
    expect(entries.get("missing.dev")).toBeNull();
  });
});

describe("lookupOpenPageRank", () => {
  it("sends a bearer key (never in the URL) and asks for no history", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(payload));
    const result = await lookupOpenPageRank({
      hostnames: ["github.com"],
      apiKey: " opr_live_secret ",
      fetchImpl,
    });
    expect(result.entries.get("github.com")?.score).toBe(9.67);
    const { url, headers, body } = sentRequest(fetchImpl);
    expect(url).toBe(OPEN_PAGERANK_ENDPOINT);
    expect(url).not.toContain("opr_live_secret");
    expect(headers.get("Authorization")).toBe("Bearer opr_live_secret");
    expect(body).toEqual({
      domains: ["github.com"],
      include_history: false,
    });
  });

  it("batches up to 100 unique domains per request", async () => {
    const hostnames = Array.from({ length: 150 }, (_, i) => `site${i}.com`);
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ as_of: "2026-10-01", results: [], invalid: [] }),
    );
    await lookupOpenPageRank({
      hostnames: [...hostnames, "SITE0.com", "www.site1.com"],
      apiKey: "k",
      fetchImpl,
      limiter: new SlidingWindowRateLimiter(60, 60_000),
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const sizes = [0, 1].map(
      (index) =>
        z.array(z.string()).parse(sentRequest(fetchImpl, index).body.domains)
          .length,
    );
    expect(sizes).toEqual([100, 50]);
  });

  it("stops before calling when the per-minute budget is spent", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(payload));
    const limiter = new SlidingWindowRateLimiter(1, 60_000);
    await lookupOpenPageRank({
      hostnames: ["github.com"],
      apiKey: "k",
      fetchImpl,
      limiter,
    });
    const error = await failure(
      lookupOpenPageRank({
        hostnames: ["github.com"],
        apiKey: "k",
        fetchImpl,
        limiter,
      }),
    );
    expect(error.kind).toBe("rate_limited");
    expect(error.retryAfterSeconds).toBeGreaterThan(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reports the free-key IP binding as an address error", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        { error: { type: "address_error", message: "wrong address" } },
        403,
      ),
    );
    const error = await failure(
      lookupOpenPageRank({ hostnames: ["github.com"], apiKey: "k", fetchImpl }),
    );
    expect(error.kind).toBe("address");
  });

  it("separates auth, quota and per-minute 429s", async () => {
    const run = async (status: number, type: string) => {
      const fetchImpl = vi.fn(async () =>
        jsonResponse({ error: { type, message: `m ${type}` } }, status, {
          "Retry-After": "12",
        }),
      );
      return failure(
        lookupOpenPageRank({
          hostnames: ["github.com"],
          apiKey: "k",
          fetchImpl,
        }),
      );
    };
    expect((await run(401, "authentication_error")).kind).toBe("auth");
    expect((await run(429, "quota_error")).kind).toBe("quota");
    const perMinute = await run(429, "rate_limit_error");
    expect(perMinute.kind).toBe("rate_limited");
    expect(perMinute.retryAfterSeconds).toBe(12);
  });

  it("redacts the key from network errors", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("boom opr_live_secret");
    });
    const error = await failure(
      lookupOpenPageRank({
        hostnames: ["github.com"],
        apiKey: "opr_live_secret",
        fetchImpl,
      }),
    );
    expect(error.message).not.toContain("opr_live_secret");
  });

  it("refuses to call without a key", async () => {
    const fetchImpl = vi.fn();
    await expect(
      lookupOpenPageRank({ hostnames: ["a.com"], apiKey: "", fetchImpl }),
    ).rejects.toBeInstanceOf(OpenPageRankError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("SlidingWindowRateLimiter", () => {
  it("allows the limit per window and frees slots as time passes", () => {
    let now = 0;
    const limiter = new SlidingWindowRateLimiter(2, 1000, () => now);
    expect(limiter.tryAcquire()).toEqual({ ok: true });
    now = 100;
    expect(limiter.tryAcquire()).toEqual({ ok: true });
    now = 200;
    expect(limiter.tryAcquire()).toEqual({ ok: false, retryAfterMs: 800 });
    now = 1000;
    expect(limiter.tryAcquire()).toEqual({ ok: true });
  });
});
