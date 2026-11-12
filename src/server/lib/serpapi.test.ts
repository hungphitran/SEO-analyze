/* eslint-disable max-lines -- one adapter contract: every SerpApi failure mode */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchSerpApi, normalizeSerpKeyword, SerpApiError } from "./serpapi";

const KEY = "test-serpapi-key-DO-NOT-LEAK-0123456789";

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  getCached: vi.fn(),
  setCached: vi.fn(),
  reserve: vi.fn(),
  release: vi.fn(),
}));

vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: async (name: string) => mocks.env[name],
}));
vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: async (prefix: string, params: Record<string, unknown>) =>
    `${prefix}:${JSON.stringify(params)}`,
  getCached: mocks.getCached,
  setCached: mocks.setCached,
}));
vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({
    RankTrackingRepository: {
      reserveSerpApiRequest: mocks.reserve,
      releaseSerpApiRequest: mocks.release,
    },
  }),
);

const organic = (n: number, offset = 0) =>
  Array.from({ length: n }, (_, i) => ({
    position: offset + i + 1,
    title: `Result ${offset + i + 1}`,
    link: `https://site${offset + i + 1}.example.com/page`,
    snippet: `Snippet ${offset + i + 1}`,
  }));

function ok(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

const baseInput = {
  projectId: "p1",
  keyword: "seo tools",
  region: "US",
  lang: "en",
  limit: 10,
  retryDelaysMs: [1, 1],
};

function fetchMock() {
  return vi.mocked(fetch);
}

async function expectError(
  promise: Promise<unknown>,
  code: string,
): Promise<SerpApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(SerpApiError);
  expect((error as SerpApiError).code).toBe(code);
  // The key must never be present in anything an error can surface.
  expect(String((error as SerpApiError).message)).not.toContain(KEY);
  expect(
    JSON.stringify(error, Object.getOwnPropertyNames(error)),
  ).not.toContain(KEY);
  return error as SerpApiError;
}

function resetAdapterMocks() {
  vi.clearAllMocks();
  mocks.env = { SERPAPI_API_KEY: KEY };
  mocks.getCached.mockResolvedValue(null);
  mocks.setCached.mockResolvedValue(undefined);
  mocks.reserve.mockResolvedValue({
    ok: true,
    keys: { day: "d", month: "m", hour: "h" },
  });
  mocks.release.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn());
}

describe("SerpApi adapter: requests and failures", () => {
  beforeEach(resetAdapterMocks);

  describe("success path", () => {
    it("returns organic ranks, features, honest depth, and caches the result", async () => {
      fetchMock().mockResolvedValue(
        ok({
          search_metadata: { id: "abc", status: "Success" },
          organic_results: organic(10),
          related_questions: [{ question: "q" }],
          answer_box: { title: "x" },
          ads: [],
          knowledge_graph: {},
        }),
      );
      const snapshot = await searchSerpApi({ ...baseInput, limit: 100 });
      expect(snapshot.provider).toBe("serpapi");
      expect(snapshot.results).toHaveLength(10);
      expect(snapshot.results[0]).toMatchObject({
        organicRank: 1,
        hostname: "site1.example.com",
        registrableDomain: "example.com",
      });
      expect(snapshot.serpFeatures).toHaveLength(2);
      expect(snapshot.serpFeatures).toEqual(
        expect.arrayContaining(["featured_snippet", "people_also_ask"]),
      );
      // One page (default) => depth 10, not the requested 100.
      expect(snapshot.limitRequested).toBe(10);
      expect(snapshot.requestId).toBe("abc");
      expect(mocks.setCached).toHaveBeenCalledOnce();
      const url = new URL(String(fetchMock().mock.calls[0][0]));
      expect(url.hostname).toBe("serpapi.com");
      expect(url.searchParams.get("gl")).toBe("us");
      expect(url.searchParams.get("engine")).toBe("google");
    });

    it("fetches extra pages only when configured, one reservation per page", async () => {
      mocks.env.SERPAPI_PAGES_PER_KEYWORD = "2";
      fetchMock()
        .mockResolvedValueOnce(ok({ organic_results: organic(10) }))
        .mockResolvedValueOnce(ok({ organic_results: organic(10, 10) }));
      const snapshot = await searchSerpApi({ ...baseInput, limit: 20 });
      expect(snapshot.results.map((r) => r.organicRank)).toEqual(
        Array.from({ length: 20 }, (_, i) => i + 1),
      );
      expect(mocks.reserve).toHaveBeenCalledTimes(2);
      expect(
        new URL(String(fetchMock().mock.calls[1][0])).searchParams.get("start"),
      ).toBe("10");
    });

    it("never returns a partial list when a later page fails", async () => {
      mocks.env.SERPAPI_PAGES_PER_KEYWORD = "2";
      fetchMock()
        .mockResolvedValueOnce(ok({ organic_results: organic(10) }))
        .mockResolvedValue(new Response("{}", { status: 400 }));
      await expectError(
        searchSerpApi({ ...baseInput, limit: 20 }),
        "upstream_error",
      );
      expect(mocks.setCached).not.toHaveBeenCalled();
    });
  });

  describe("configuration and authentication", () => {
    it("reports a missing key before any request or reservation", async () => {
      mocks.env = {};
      await expectError(searchSerpApi(baseInput), "configuration_error");
      expect(fetch).not.toHaveBeenCalled();
      expect(mocks.reserve).not.toHaveBeenCalled();
    });

    it.each([401, 403])(
      "maps HTTP %i to a configuration error, never retries and refunds the reservation",
      async (status) => {
        fetchMock().mockResolvedValue(
          ok({ error: "Invalid API key." }, { status }),
        );
        await expectError(searchSerpApi(baseInput), "configuration_error");
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(mocks.release).toHaveBeenCalledOnce();
      },
    );

    it("maps an 'Invalid API key' JSON error that arrives with HTTP 200", async () => {
      fetchMock().mockResolvedValue(
        ok({ error: "Invalid API key. Your API key should be here" }),
      );
      await expectError(searchSerpApi(baseInput), "configuration_error");
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("rejects an out-of-range configured cap", async () => {
      mocks.env.SERPAPI_MAX_KEYWORDS_PER_DAY = "0";
      await expectError(searchSerpApi(baseInput), "configuration_error");
      mocks.env.SERPAPI_MAX_KEYWORDS_PER_DAY = "abc";
      await expectError(searchSerpApi(baseInput), "configuration_error");
      expect(fetch).not.toHaveBeenCalled();
    });

    it("passes the configured caps to the reservation", async () => {
      mocks.env.SERPAPI_MAX_KEYWORDS_PER_DAY = "3";
      mocks.env.SERPAPI_MAX_SEARCHES_PER_MONTH = "100";
      mocks.env.SERPAPI_MAX_SEARCHES_PER_HOUR = "20";
      fetchMock().mockResolvedValue(ok({ organic_results: organic(10) }));
      await searchSerpApi(baseInput);
      expect(mocks.reserve).toHaveBeenCalledWith("p1", {
        daily: 3,
        monthly: 100,
        hourly: 20,
      });
    });

    it("defaults to 8/day, 250/month, 50/hour", async () => {
      fetchMock().mockResolvedValue(ok({ organic_results: organic(10) }));
      await searchSerpApi(baseInput);
      expect(mocks.reserve).toHaveBeenCalledWith("p1", {
        daily: 8,
        monthly: 250,
        hourly: 50,
      });
    });
  });

  describe("quota", () => {
    it.each(["daily", "monthly", "hourly"] as const)(
      "stops locally when the %s cap is reached, with no request",
      async (reason) => {
        mocks.reserve.mockResolvedValue({ ok: false, reason });
        const error = await expectError(
          searchSerpApi(baseInput),
          "quota_exceeded",
        );
        expect(error.message).toMatch(new RegExp(reason));
        expect(fetch).not.toHaveBeenCalled();
      },
    );

    it("maps HTTP 429 'run out of searches' to quota_exceeded without retrying", async () => {
      fetchMock().mockResolvedValue(
        ok({ error: "Your account has run out of searches." }, { status: 429 }),
      );
      await expectError(searchSerpApi(baseInput), "quota_exceeded");
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("maps the same JSON error delivered with HTTP 200", async () => {
      fetchMock().mockResolvedValue(
        ok({ error: "Your account has run out of searches." }),
      );
      await expectError(searchSerpApi(baseInput), "quota_exceeded");
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("maps HTTP 429 throughput limits to rate_limited without retrying", async () => {
      fetchMock().mockResolvedValue(
        ok(
          { error: "Your account's hourly throughput limit exceeded." },
          { status: 429, headers: { "retry-after": "60" } },
        ),
      );
      const error = await expectError(searchSerpApi(baseInput), "rate_limited");
      expect(error.details?.retryAfterSeconds).toBe(60);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("maps a bare HTTP 429 to rate_limited", async () => {
      fetchMock().mockResolvedValue(new Response("", { status: 429 }));
      await expectError(searchSerpApi(baseInput), "rate_limited");
    });
  });

  describe("transient failures", () => {
    it("retries 5xx with backoff and then succeeds", async () => {
      fetchMock()
        .mockResolvedValueOnce(new Response("bad gateway", { status: 502 }))
        .mockResolvedValueOnce(ok({}, { status: 503 }))
        .mockResolvedValueOnce(ok({ organic_results: organic(10) }));
      const snapshot = await searchSerpApi(baseInput);
      expect(snapshot.results).toHaveLength(10);
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(mocks.reserve).toHaveBeenCalledTimes(1);
    });

    it("gives up after the bounded retries, refunds and records upstream_error", async () => {
      fetchMock().mockImplementation(
        async () => new Response("down", { status: 500 }),
      );
      await expectError(searchSerpApi(baseInput), "upstream_error");
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(mocks.release).toHaveBeenCalledOnce();
    });

    it("retries network errors", async () => {
      fetchMock()
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockResolvedValueOnce(ok({ organic_results: organic(10) }));
      await searchSerpApi(baseInput);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("retries a timeout once only and keeps the reservation (may have been billed)", async () => {
      fetchMock().mockRejectedValue(
        new DOMException("timed out", "TimeoutError"),
      );
      await expectError(searchSerpApi(baseInput), "timeout");
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(mocks.release).not.toHaveBeenCalled();
    });

    it("never echoes the request URL (which carries the key) in a network error", async () => {
      fetchMock().mockRejectedValue(
        new TypeError(
          `fetch failed for https://serpapi.com/search.json?api_key=${KEY}`,
        ),
      );
      await expectError(searchSerpApi(baseInput), "upstream_error");
    });
  });

  describe("malformed and empty responses", () => {
    it("rejects invalid JSON on HTTP 200 without retrying", async () => {
      fetchMock().mockResolvedValue(
        new Response("<html>oops</html>", { status: 200 }),
      );
      await expectError(searchSerpApi(baseInput), "invalid_response");
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(mocks.setCached).not.toHaveBeenCalled();
    });

    it("rejects a wrongly typed organic_results", async () => {
      fetchMock().mockResolvedValue(ok({ organic_results: "nope" }));
      await expectError(searchSerpApi(baseInput), "invalid_response");
    });

    it("rejects a result with a missing or non-http link", async () => {
      fetchMock().mockResolvedValue(
        ok({ organic_results: [{ title: "x", position: 1 }] }),
      );
      await expectError(searchSerpApi(baseInput), "invalid_response");
      fetchMock().mockResolvedValue(
        ok({ organic_results: [{ title: "x", link: "javascript:alert(1)" }] }),
      );
      await expectError(searchSerpApi(baseInput), "invalid_response");
    });

    it("treats a missing organic_results as unverified, not as 'not ranked'", async () => {
      fetchMock().mockResolvedValue(
        ok({ search_metadata: { status: "Success" } }),
      );
      await expectError(searchSerpApi(baseInput), "no_results_unverified");
    });

    it("treats an empty list and Google's 'no results' error as unverified", async () => {
      fetchMock().mockResolvedValue(ok({ organic_results: [] }));
      await expectError(searchSerpApi(baseInput), "no_results_unverified");
      fetchMock().mockResolvedValue(
        ok({ error: "Google hasn't returned any results for this query." }),
      );
      await expectError(searchSerpApi(baseInput), "no_results_unverified");
    });

    it("treats search_metadata.status=Error as an upstream error", async () => {
      fetchMock().mockResolvedValue(
        ok({
          search_metadata: { status: "Error" },
          organic_results: organic(3),
        }),
      );
      await expectError(searchSerpApi(baseInput), "upstream_error");
    });

    it("rejects an oversized response", async () => {
      fetchMock().mockResolvedValue(
        new Response("{}", { headers: { "content-length": "99999999" } }),
      );
      await expectError(searchSerpApi(baseInput), "invalid_response");
    });
  });

});

describe("SerpApi adapter: input and cache", () => {
  beforeEach(resetAdapterMocks);

  describe("input validation", () => {
    it.each(["", "   ", "\n\t "])(
      "rejects an empty keyword %j before any quota",
      async (keyword) => {
        await expectError(
          searchSerpApi({ ...baseInput, keyword }),
          "invalid_input",
        );
        expect(mocks.reserve).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
      },
    );

    it("rejects an over-long keyword", async () => {
      await expectError(
        searchSerpApi({ ...baseInput, keyword: "a".repeat(301) }),
        "invalid_input",
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it("normalizes whitespace, control characters and Unicode form", () => {
      expect(normalizeSerpKeyword("  seo \u0000 tools\n\tnow  ")).toBe(
        "seo tools now",
      );
      // NFD input (decomposed diacritics) becomes NFC.
      const nfd = "xe\u0302\u0301p ha\u0323ng".normalize("NFD");
      expect(normalizeSerpKeyword(nfd)).toBe(nfd.normalize("NFC"));
    });

    it("sends Vietnamese diacritics and special characters intact", async () => {
      fetchMock().mockResolvedValue(ok({ organic_results: organic(10) }));
      const keyword = 'dịch vụ SEO "giá rẻ" & site:vn +100% #1?';
      await searchSerpApi({ ...baseInput, keyword, region: "VN", lang: "vi" });
      const url = new URL(String(fetchMock().mock.calls[0][0]));
      expect(url.searchParams.get("q")).toBe(keyword);
      expect(url.searchParams.get("gl")).toBe("vn");
      expect(url.searchParams.get("hl")).toBe("vi");
      // The raw URL must be percent-encoded, with no bare '&' from the keyword.
      expect(String(fetchMock().mock.calls[0][0])).not.toContain("giá rẻ");
    });

    it.each(["", "USA", "1A", "u s"])(
      "rejects invalid region %j",
      async (region) => {
        await expectError(
          searchSerpApi({ ...baseInput, region }),
          "unsupported_targeting",
        );
        expect(fetch).not.toHaveBeenCalled();
      },
    );

    it.each(["", "english", "e", "en_US", "en-"])(
      "rejects invalid language %j",
      async (lang) => {
        await expectError(
          searchSerpApi({ ...baseInput, lang }),
          "unsupported_targeting",
        );
        expect(fetch).not.toHaveBeenCalled();
      },
    );

    it("accepts regional language tags like pt-br", async () => {
      fetchMock().mockResolvedValue(ok({ organic_results: organic(10) }));
      await searchSerpApi({ ...baseInput, lang: "pt-BR" });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("rejects city-level targeting before any request", async () => {
      await expectError(
        searchSerpApi({ ...baseInput, locationName: "Hà Nội" }),
        "unsupported_targeting",
      );
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("cache and de-duplication", () => {
    const cachedEntry = {
      fetchedAt: "2026-11-12T00:00:00.000Z",
      pagesFetched: 1,
      results: organic(10).map((r) => ({
        organicRank: r.position,
        absolutePosition: null,
        title: r.title,
        url: r.link,
        hostname: new URL(r.link).hostname,
        registrableDomain: "example.com",
        snippet: r.snippet,
      })),
      serpFeatures: ["featured_snippet"],
    };

    it("answers from cache without a reservation or request", async () => {
      mocks.getCached.mockResolvedValue(cachedEntry);
      const snapshot = await searchSerpApi(baseInput);
      expect(snapshot.fetchedAt).toBe(cachedEntry.fetchedAt);
      expect(snapshot.results).toHaveLength(10);
      expect(fetch).not.toHaveBeenCalled();
      expect(mocks.reserve).not.toHaveBeenCalled();
    });

    it("uses the same cache key regardless of keyword case or spacing", async () => {
      fetchMock().mockImplementation(async () =>
        ok({ organic_results: organic(10) }),
      );
      await searchSerpApi({ ...baseInput, keyword: "SEO  Tools " });
      await searchSerpApi({ ...baseInput, keyword: "seo tools" });
      expect(mocks.getCached.mock.calls[0][0]).toBe(
        mocks.getCached.mock.calls[1][0],
      );
    });

    it.each([
      ["a string", "garbage"],
      ["wrong shape", { results: "x" }],
      ["an empty snapshot", { ...cachedEntry, results: [] }],
      [
        "a shallower page count than needed",
        { ...cachedEntry, pagesFetched: 1 },
      ],
    ])("treats a corrupt cache entry (%s) as a miss", async (_name, entry) => {
      mocks.env.SERPAPI_PAGES_PER_KEYWORD = "2";
      mocks.getCached.mockResolvedValue(entry);
      fetchMock()
        .mockResolvedValueOnce(ok({ organic_results: organic(10) }))
        .mockResolvedValueOnce(ok({ organic_results: organic(10, 10) }));
      await searchSerpApi({ ...baseInput, limit: 20 });
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("treats an expired entry (cache returns null) and a cache read failure as misses", async () => {
      fetchMock().mockImplementation(async () =>
        ok({ organic_results: organic(10) }),
      );
      mocks.getCached.mockResolvedValueOnce(null);
      await searchSerpApi(baseInput);
      mocks.getCached.mockRejectedValueOnce(new Error("R2 down"));
      await searchSerpApi({ ...baseInput, keyword: "another" });
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("still returns the result when the cache write fails", async () => {
      fetchMock().mockResolvedValue(ok({ organic_results: organic(10) }));
      mocks.setCached.mockRejectedValue(new Error("R2 down"));
      const snapshot = await searchSerpApi(baseInput);
      expect(snapshot.results).toHaveLength(10);
    });

    it("runs identical parallel searches once (one request, one reservation)", async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      fetchMock().mockImplementation(async () => {
        await gate;
        return ok({ organic_results: organic(10) });
      });
      const runs = Promise.all([
        searchSerpApi(baseInput),
        searchSerpApi(baseInput),
        searchSerpApi({ ...baseInput, keyword: "SEO TOOLS" }),
      ]);
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      release();
      const [a, b, c] = await runs;
      expect(a.results).toHaveLength(10);
      expect(b.results).toHaveLength(10);
      expect(c.results).toHaveLength(10);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(mocks.reserve).toHaveBeenCalledTimes(1);
    });

    it("does not let a failed in-flight search poison the next call", async () => {
      fetchMock().mockResolvedValueOnce(new Response("", { status: 401 }));
      await expectError(searchSerpApi(baseInput), "configuration_error");
      fetchMock().mockResolvedValueOnce(ok({ organic_results: organic(10) }));
      await expect(searchSerpApi(baseInput)).resolves.toBeDefined();
    });
  });
});
