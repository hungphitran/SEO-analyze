import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";
import {
  assertVerifiedBingSite,
  BingWebmasterError,
  getBingQueryStats,
  listVerifiedBingSites,
  sameBingSite,
  toBingAppError,
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
      if (error instanceof Error)
        expect(error.message).not.toContain("bing-secret");
    }
  });
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("Bing Webmaster edge cases", () => {
  const KEY = "bing-secret-key-0123456789";
  const noDelay = [1, 1];
  const sitesBody = {
    d: [
      {
        Url: "https://Example.com/",
        IsVerified: true,
        AuthenticationCode: "x",
      },
      { Url: "https://pending.example.org/", IsVerified: false },
    ],
  };

  async function fail(promise: Promise<unknown>) {
    const error = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(BingWebmasterError);
    const bing = error as BingWebmasterError;
    expect(bing.message).not.toContain(KEY);
    return bing;
  }

  it("requires a key before any request", async () => {
    const fetchImpl = vi.fn();
    const error = await fail(
      listVerifiedBingSites({ apiKey: "  ", fetchImpl }),
    );
    expect(error.kind).toBe("invalid_input");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [401, {}],
    [403, {}],
    [400, { ErrorCode: 14, Message: "InvalidApiKey" }],
    [400, { Message: "NotAuthorized" }],
  ])(
    "maps HTTP %i %j to key_rejected without retrying",
    async (status, body) => {
      const fetchImpl = vi.fn(async () => json(body, status));
      const error = await fail(
        listVerifiedBingSites({
          apiKey: KEY,
          fetchImpl,
          retryDelaysMs: noDelay,
        }),
      );
      expect(error.kind).toBe("key_rejected");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );

  it("maps HTTP 429 to throttled without retrying", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ Message: "Too many requests" }, 429),
    );
    const error = await fail(
      listVerifiedBingSites({ apiKey: KEY, fetchImpl, retryDelaysMs: noDelay }),
    );
    expect(error.kind).toBe("throttled");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries 5xx and network errors with backoff, then succeeds", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("bad gateway", { status: 502 }))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(json(sitesBody));
    const sites = await listVerifiedBingSites({
      apiKey: KEY,
      fetchImpl,
      retryDelaysMs: noDelay,
    });
    expect(sites).toEqual([{ url: "https://Example.com/" }]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("gives up after the bounded retries as 'unavailable' and never leaks the key", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError(`fetch failed https://ssl.bing.com/x?apikey=${KEY}`);
    });
    const error = await fail(
      listVerifiedBingSites({ apiKey: KEY, fetchImpl, retryDelaysMs: noDelay }),
    );
    expect(error.kind).toBe("unavailable");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("treats a timeout as unavailable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    const error = await fail(
      listVerifiedBingSites({ apiKey: KEY, fetchImpl, retryDelaysMs: [] }),
    );
    expect(error.kind).toBe("unavailable");
  });

  it("rejects malformed JSON on HTTP 200 as invalid_response", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("<html></html>", { status: 200 }),
    );
    const error = await fail(
      listVerifiedBingSites({ apiKey: KEY, fetchImpl, retryDelaysMs: noDelay }),
    );
    expect(error.kind).toBe("invalid_response");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns no sites (not an error) for a payload without a site list", async () => {
    const fetchImpl = vi.fn(async () => json({ d: null }));
    await expect(
      listVerifiedBingSites({ apiKey: KEY, fetchImpl }),
    ).resolves.toEqual([]);
  });

  it("refuses a site that is not verified for the key, with the not_verified kind", async () => {
    const fetchImpl = vi.fn(async () => json(sitesBody));
    for (const siteUrl of [
      "https://pending.example.org/",
      "https://other.com/",
    ]) {
      const error = await fail(
        assertVerifiedBingSite({ apiKey: KEY, siteUrl, fetchImpl }),
      );
      expect(error.kind).toBe("not_verified");
    }
  });

  it("matches a verified site ignoring case and a trailing slash", async () => {
    const fetchImpl = vi.fn(async () => json(sitesBody));
    await expect(
      assertVerifiedBingSite({
        apiKey: KEY,
        siteUrl: "https://example.com",
        fetchImpl,
      }),
    ).resolves.toEqual({ url: "https://Example.com/" });
    expect(sameBingSite("HTTPS://EXAMPLE.COM//", "https://example.com/")).toBe(
      true,
    );
    expect(sameBingSite("https://a.com/", "https://b.com/")).toBe(false);
  });

  it("returns an empty query summary when Bing has no stats yet", async () => {
    const fetchImpl = vi.fn(async () => json({ d: [] }));
    const stats = await getBingQueryStats({
      apiKey: KEY,
      siteUrl: "https://example.com/",
      fetchImpl,
    });
    expect(stats).toMatchObject({ queryCount: 0, totalClicks: 0, queries: [] });
  });

  it.each([
    ["key_rejected", "BING_KEY_REJECTED"],
    ["not_verified", "BING_SITE_NOT_VERIFIED"],
    ["throttled", "BING_THROTTLED"],
    ["invalid_input", "VALIDATION_ERROR"],
    ["unavailable", "BING_UNAVAILABLE"],
    ["invalid_response", "BING_UNAVAILABLE"],
  ] as const)("maps %s to the client code %s", (kind, code) => {
    const mapped = toBingAppError(new BingWebmasterError("m", 0, kind));
    expect(mapped).toBeInstanceOf(AppError);
    expect((mapped as AppError).code).toBe(code);
    const other = new Error("x");
    expect(toBingAppError(other)).toBe(other);
  });

  describe("classification by Bing ErrorCode (not message words)", () => {
    const bingError = (errorCode: number, message: string, status = 400) =>
      json({ ErrorCode: errorCode, Message: message }, status);
    const run = (response: Response) => {
      const fetchImpl = vi.fn(async () => response);
      return {
        fetchImpl,
        result: fail(
          listVerifiedBingSites({
            apiKey: KEY,
            fetchImpl,
            retryDelaysMs: noDelay,
          }),
        ),
      };
    };

    it("maps the real 400 InvalidApiKey body to key_rejected after one call", async () => {
      const { fetchImpl, result } = run(bingError(3, "ERROR!!! InvalidApiKey"));
      const error = await result;
      expect(error.kind).toBe("key_rejected");
      expect(error.errorCode).toBe(3);
      expect(toBingAppError(error)).toMatchObject({
        code: "BING_KEY_REJECTED",
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it.each([
      [4, "ERROR!!! ThrottleUser"],
      [5, "ERROR!!! ThrottleHost"],
    ])("maps ErrorCode %i to throttled without retrying", async (code, msg) => {
      const { fetchImpl, result } = run(bingError(code, msg));
      const error = await result;
      expect(error.kind).toBe("throttled");
      expect(toBingAppError(error)).toMatchObject({ code: "BING_THROTTLED" });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("does not treat the words quota/throttle in an unrelated error as throttling", async () => {
      const { result } = run(
        bingError(2, "ERROR!!! UnknownError: quota calculation failed"),
      );
      const error = await result;
      expect(error.kind).toBe("unavailable");
      expect(toBingAppError(error)).toMatchObject({ code: "BING_UNAVAILABLE" });
    });

    it("keeps InvalidApiKey even if the message mentions quota", async () => {
      const { result } = run(bingError(3, "InvalidApiKey (quota key)"));
      expect((await result).kind).toBe("key_rejected");
    });

    it("maps NotAuthorized (14) to key_rejected and unknown 400s to unavailable", async () => {
      expect(
        (await run(bingError(14, "ERROR!!! NotAuthorized")).result).kind,
      ).toBe("key_rejected");
      expect((await run(bingError(99, "Something new")).result).kind).toBe(
        "unavailable",
      );
    });

    it("falls back to message text only when no ErrorCode is sent", async () => {
      expect(
        (await run(json({ Message: "ERROR!!! InvalidApiKey" }, 400)).result)
          .kind,
      ).toBe("key_rejected");
      expect(
        (await run(json({ Message: "ERROR!!! ThrottleHost" }, 400)).result)
          .kind,
      ).toBe("throttled");
      expect(
        (
          await run(json({ Message: "Quota exceeded for something" }, 400))
            .result
        ).kind,
      ).toBe("unavailable");
    });

    it("logs status/ErrorCode/kind but never the API key", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        await run(bingError(4, `ERROR!!! ThrottleUser ${KEY}`)).result;
        const lines = warn.mock.calls.map((call) => call.join(" ")).join("\n");
        expect(lines).toContain("status=400");
        expect(lines).toContain("errorCode=4");
        expect(lines).toContain("kind=throttled");
        expect(lines).not.toContain(KEY);
        expect(lines).not.toContain("apikey");
      } finally {
        warn.mockRestore();
      }
    });
  });
});
