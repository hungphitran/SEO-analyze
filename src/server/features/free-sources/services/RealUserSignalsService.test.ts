import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  cache: new Map<string, unknown>(),
  kv: new Map<string, string>(),
  fetch: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  waitUntil: (promise: Promise<unknown>) => void promise,
  env: {},
}));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: async (name: string) => mocks.env[name],
  getWorkersEnv: async () => ({
    KV: {
      get: async (key: string) => mocks.kv.get(key) ?? null,
      put: async (key: string, value: string) => void mocks.kv.set(key, value),
    },
  }),
}));
vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: async (prefix: string, params: Record<string, unknown>) =>
    `${prefix}:${JSON.stringify(params)}`,
  getCached: async (key: string) => mocks.cache.get(key) ?? null,
  setCached: async (key: string, value: unknown) => {
    mocks.cache.set(key, JSON.parse(JSON.stringify(value)));
  },
}));

import {
  getCruxApiKey,
  getCruxVitals,
  getOpenPageRank,
} from "./RealUserSignalsService";

const recordBody = {
  record: {
    metrics: {
      largest_contentful_paint: {
        histogram: [
          { start: 0, end: 2500, density: 0.8 },
          { start: 2500, end: 4000, density: 0.15 },
          { start: 4000, density: 0.05 },
        ],
        percentiles: { p75: 2100 },
      },
    },
    collectionPeriod: {
      firstDate: { year: 2026, month: 10, day: 12 },
      lastDate: { year: 2026, month: 11, day: 8 },
    },
  },
};

const historyBody = {
  record: {
    metrics: {
      largest_contentful_paint: {
        percentilesTimeseries: { p75s: [2200, 2100] },
      },
    },
    collectionPeriods: [
      { lastDate: { year: 2026, month: 11, day: 1 } },
      { lastDate: { year: 2026, month: 11, day: 8 } },
    ],
  },
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  mocks.env = {};
  mocks.cache.clear();
  mocks.kv.clear();
  mocks.fetch.mockReset();
  vi.stubGlobal("fetch", mocks.fetch);
});

describe("getCruxApiKey", () => {
  it("prefers CRUX_API_KEY and falls back to the PageSpeed key", async () => {
    expect(await getCruxApiKey()).toBeNull();
    mocks.env.PAGESPEED_API_KEY = " ps ";
    expect(await getCruxApiKey()).toBe("ps");
    mocks.env.CRUX_API_KEY = "crux";
    expect(await getCruxApiKey()).toBe("crux");
  });
});

describe("getCruxVitals", () => {
  it("is disabled, and calls nothing, without a key", async () => {
    await expect(getCruxVitals({ domain: "example.com" })).resolves.toEqual({
      state: "disabled",
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("asks for a website when the project has none", async () => {
    mocks.env.CRUX_API_KEY = "k";
    await expect(getCruxVitals({ domain: "" })).resolves.toEqual({
      state: "no_website",
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("loads origin and homepage, then serves repeats from cache", async () => {
    mocks.env.CRUX_API_KEY = "k";
    mocks.fetch.mockImplementation(async (url: string) =>
      respond(url.includes("History") ? historyBody : recordBody),
    );
    const first = await getCruxVitals({ domain: "example.com" });
    expect(first.state).toBe("ready");
    if (first.state !== "ready") return;
    expect(first.origin).toMatchObject({
      status: "ok",
      target: "https://example.com",
    });
    expect(first.url).toMatchObject({
      status: "ok",
      target: "https://example.com/",
    });
    if (first.origin.status === "ok") {
      expect(first.origin.record.metrics.lcp?.p75).toBe(2100);
      expect(first.origin.trend?.metrics.lcp?.p75s).toEqual([2200, 2100]);
    }
    expect(mocks.fetch).toHaveBeenCalledTimes(4);

    await getCruxVitals({ domain: "example.com" });
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
  });

  it("shows 'no data' for a 404 instead of an error", async () => {
    mocks.env.CRUX_API_KEY = "k";
    mocks.fetch.mockImplementation(async () => respond({}, 404));
    const result = await getCruxVitals({ domain: "tiny.example" });
    expect(result).toMatchObject({
      state: "ready",
      origin: { status: "no_data" },
      url: { status: "no_data" },
    });
  });

  it("reports api_not_enabled when Google refuses the key", async () => {
    mocks.env.PAGESPEED_API_KEY = "ps";
    mocks.fetch.mockImplementation(async () =>
      respond({ error: { code: 403, message: "Permission denied" } }, 403),
    );
    await expect(getCruxVitals({ domain: "example.com" })).resolves.toEqual({
      state: "api_not_enabled",
    });
  });

  it("keeps other failures per target and never caches them", async () => {
    mocks.env.CRUX_API_KEY = "k";
    mocks.fetch.mockImplementation(async () => respond({}, 500));
    const result = await getCruxVitals({ domain: "example.com" });
    expect(result).toMatchObject({
      state: "ready",
      origin: { status: "error" },
    });
    expect(mocks.cache.size).toBe(0);
  });
});

describe("getCruxVitals edge cases", () => {
  it("refetches when the cached entry is corrupt instead of failing", async () => {
    mocks.env.CRUX_API_KEY = "k";
    mocks.cache.set(
      'crux:target:{"target":{"origin":"https://example.com"},"formFactor":"ALL"}',
      { status: "ok", target: 123, record: "garbage" },
    );
    mocks.fetch.mockImplementation(async (url: string) =>
      respond(url.includes("History") ? historyBody : recordBody),
    );
    const result = await getCruxVitals({ domain: "example.com" });
    expect(result).toMatchObject({ state: "ready", origin: { status: "ok" } });
    expect(mocks.fetch).toHaveBeenCalled();
  });

  it("shows a stable rate-limit reason (no retry, no cache) on 429", async () => {
    mocks.env.CRUX_API_KEY = "k";
    mocks.fetch.mockImplementation(async () => respond({}, 429));
    const result = await getCruxVitals({ domain: "example.com" });
    expect(result).toMatchObject({
      state: "ready",
      origin: { status: "error", kind: "rate_limited" },
    });
    // record + history for origin and homepage, one attempt each.
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
    expect(mocks.cache.size).toBe(0);
  });

  it("reports a malformed 200 as an error, not as 'no data'", async () => {
    mocks.env.CRUX_API_KEY = "k";
    mocks.fetch.mockImplementation(
      async () => new Response("<html>gateway</html>"),
    );
    const result = await getCruxVitals({ domain: "example.com" });
    expect(result).toMatchObject({
      state: "ready",
      origin: { status: "error", kind: "invalid_response" },
    });
    expect(mocks.cache.size).toBe(0);
  });

  it("never leaks the key in an error result", async () => {
    mocks.env.CRUX_API_KEY = "super-secret-key";
    mocks.fetch.mockImplementation(async () =>
      respond({ error: { message: "bad super-secret-key" } }, 400),
    );
    const result = await getCruxVitals({ domain: "example.com" });
    expect(JSON.stringify(result)).not.toContain("super-secret-key");
  });
});

describe("getOpenPageRank", () => {
  const body = {
    as_of: "2026-10-01",
    results: [
      {
        domain: "example.com",
        found: true,
        open_page_rank: 6.2,
        rank: 12345,
        referring_domains: 800,
      },
    ],
    invalid: [],
  };

  it("is disabled, and calls nothing, without a key", async () => {
    await expect(getOpenPageRank({ domain: "example.com" })).resolves.toEqual({
      state: "disabled",
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rejects an unusable domain without calling the API", async () => {
    mocks.env.OPEN_PAGERANK_API_KEY = "k";
    await expect(getOpenPageRank({ domain: "not a domain" })).resolves.toEqual({
      state: "invalid_domain",
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("returns the score and caches it", async () => {
    mocks.env.OPEN_PAGERANK_API_KEY = "k";
    mocks.fetch.mockImplementation(async () => respond(body));
    const first = await getOpenPageRank({
      domain: "https://www.example.com/x",
    });
    expect(first).toMatchObject({
      state: "ok",
      domain: "example.com",
      score: 6.2,
      rank: 12345,
      referringDomains: 800,
      asOf: "2026-10-01",
    });
    await getOpenPageRank({ domain: "example.com" });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("reports an unknown domain as no data", async () => {
    mocks.env.OPEN_PAGERANK_API_KEY = "k";
    mocks.fetch.mockImplementation(async () =>
      respond({ as_of: "2026-10-01", results: [], invalid: [] }),
    );
    await expect(getOpenPageRank({ domain: "nobody.dev" })).resolves.toEqual({
      state: "no_data",
      domain: "nobody.dev",
    });
  });

  it("stops at 60 requests per minute across isolates", async () => {
    mocks.env.OPEN_PAGERANK_API_KEY = "k";
    mocks.kv.set(`opr-rpm:${Math.floor(Date.now() / 60_000)}`, "60");
    const result = await getOpenPageRank({ domain: "example.com" });
    expect(result).toMatchObject({ state: "rate_limited" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("maps the free-key IP binding to address_blocked", async () => {
    mocks.env.OPEN_PAGERANK_API_KEY = "k";
    mocks.fetch.mockImplementation(async () =>
      respond({ error: { type: "address_error", message: "wrong IP" } }, 403),
    );
    await expect(getOpenPageRank({ domain: "example.com" })).resolves.toEqual({
      state: "address_blocked",
      domain: "example.com",
    });
    expect(mocks.cache.size).toBe(0);
  });
});
