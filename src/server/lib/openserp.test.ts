import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertOpenSerpReady,
  resolveSerpProvider,
  searchOpenSerp,
} from "./openserp";
import type { OpenSerpError } from "./openserp";

const mocks = vi.hoisted(() => ({
  getOptionalEnvValue: vi.fn(),
  isFreeSourcesOnly: vi.fn(),
}));

vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: mocks.getOptionalEnvValue,
}));
vi.mock("@/server/lib/free-sources/mode", () => ({
  isFreeSourcesOnly: mocks.isFreeSourcesOnly,
}));

function envelope(results: unknown[], features: unknown[] = []): Response {
  return new Response(
    JSON.stringify({
      query: { text: "seo tools" },
      meta: { request_id: "req-1", engines_failed: [] },
      results,
      serp_features: features,
      pagination: { page: 1, has_more: false, next_start: 10 },
    }),
    { headers: { "content-type": "application/json" } },
  );
}

describe("OpenSERP search contract", () => {
  beforeEach(() => {
    mocks.getOptionalEnvValue.mockImplementation(async (name: string) => {
      const values: Record<string, string> = {
        OPENSERP_ENABLED: "true",
        OPENSERP_URL: "http://openserp:7000",
      };
      return values[name];
    });
    mocks.isFreeSourcesOnly.mockResolvedValue(false);
    vi.stubGlobal("fetch", vi.fn());
  });

  it("rejects city-level targeting before a request can be made", async () => {
    await expect(
      assertOpenSerpReady({ locationName: "San Francisco" }),
    ).rejects.toMatchObject({ code: "unsupported_targeting" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("counts organic results separately from absolute SERP position", async () => {
    vi.mocked(fetch).mockResolvedValue(
      envelope([
        {
          id: "ad-1",
          type: "paid",
          url: "https://ads.example.com/",
          position: { absolute: 1 },
        },
        {
          id: "organic-1",
          type: "organic",
          title: "First result",
          url: "https://www.example.co.uk/page",
          snippet: "First snippet",
          position: { absolute: 2 },
        },
        {
          id: "feature-1",
          type: "people_also_ask",
          position: { absolute: 3 },
        },
        {
          id: "organic-2",
          type: "organic",
          title: "Second result",
          url: "https://shop.example.com.vn/item",
          position: { absolute: 4 },
        },
      ]),
    );

    const snapshot = await searchOpenSerp({
      keyword: "seo tools",
      region: "VN",
      lang: "vi",
      limit: 10,
    });

    expect(snapshot.results).toEqual([
      expect.objectContaining({
        sourceId: "organic-1",
        organicRank: 1,
        absolutePosition: 2,
        hostname: "example.co.uk",
        registrableDomain: "example.co.uk",
      }),
      expect.objectContaining({
        sourceId: "organic-2",
        organicRank: 2,
        absolutePosition: 4,
        registrableDomain: "example.com.vn",
      }),
    ]);
    expect(snapshot.requestId).toBe("req-1");
    const [requestUrl, requestInit] = vi.mocked(fetch).mock.calls[0] ?? [];
    if (!(requestUrl instanceof URL)) {
      throw new Error("OpenSERP search must use a URL request target.");
    }
    expect(requestUrl.href).toContain(
      "/google/search?text=seo+tools&region=VN&lang=vi&limit=10",
    );
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ["empty SERP", envelope([]), "no_results_unverified"],
    [
      "unexpected response",
      new Response("<html>challenge</html>", {
        headers: { "content-type": "text/html" },
      }),
      "invalid_response",
    ],
    [
      "blocked request",
      new Response("captcha challenge", { status: 403 }),
      "captcha",
    ],
    [
      "rate-limited request",
      new Response("", { status: 429, headers: { "retry-after": "15" } }),
      "rate_limited",
    ],
  ] as const)(
    "does not turn %s into a rank observation",
    async (_label, response, code) => {
      vi.mocked(fetch).mockResolvedValue(response);

      await expect(
        searchOpenSerp({
          keyword: "seo tools",
          region: "VN",
          lang: "vi",
          limit: 10,
        }),
      ).rejects.toMatchObject<Partial<OpenSerpError>>({ code });
    },
  );

  it("fails closed in free-sources mode unless OpenSERP is explicitly selected", async () => {
    mocks.getOptionalEnvValue.mockResolvedValue(undefined);
    mocks.isFreeSourcesOnly.mockResolvedValue(true);

    await expect(resolveSerpProvider()).rejects.toMatchObject({
      code: "FREE_SOURCES_ONLY",
    });
  });
});
