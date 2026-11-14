import { describe, expect, it, vi } from "vitest";
import {
  BingWebmasterError,
  listVerifiedBingSites,
  normalizeManualBingSite,
  toBingAppError,
  verifyBingSiteAccess,
} from "./bing";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("Bing Webmaster error classification and manual site path", () => {
  const KEY = "bing-secret-key-0123456789";
  const noDelay = [1, 1];

  async function fail(promise: Promise<unknown>) {
    const error = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    if (!(error instanceof BingWebmasterError)) {
      throw new Error("expected BingWebmasterError");
    }
    const bing = error;
    expect(bing.message).not.toContain(KEY);
    return bing;
  }

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

  describe("ThrottleIP (Bing limiting the server's shared egress IP)", () => {
    const ipThrottle = () =>
      json({ ErrorCode: 17, Message: "ERROR!!! ThrottleIP" }, 400);

    it("maps the observed ErrorCode 17 to ip_throttled after one call", async () => {
      const fetchImpl = vi.fn(async () => ipThrottle());
      const error = await fail(
        listVerifiedBingSites({
          apiKey: KEY,
          fetchImpl,
          retryDelaysMs: noDelay,
        }),
      );
      expect(error.kind).toBe("ip_throttled");
      expect(error.errorCode).toBe(17);
      expect(toBingAppError(error)).toMatchObject({
        code: "BING_IP_THROTTLED",
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("recognises ThrottleIP by message when no ErrorCode is sent", async () => {
      const error = await fail(
        listVerifiedBingSites({
          apiKey: KEY,
          fetchImpl: async () => json({ Message: "ERROR!!! ThrottleIP" }, 400),
          retryDelaysMs: noDelay,
        }),
      );
      expect(error.kind).toBe("ip_throttled");
    });
  });

  describe("manual site verification (GetUrlSubmissionQuota)", () => {
    const quota = { d: { __type: "UrlSubmissionQuota", DailyQuota: 10 } };

    it("calls the cheap per-site method once and passes", async () => {
      const fetchImpl = vi.fn(async () => json(quota));
      await verifyBingSiteAccess({
        apiKey: KEY,
        siteUrl: "https://example.com/",
        fetchImpl,
        retryDelaysMs: noDelay,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const calledUrl = String(fetchImpl.mock.calls.at(0)?.at(0));
      expect(calledUrl).toContain("/GetUrlSubmissionQuota?");
      expect(calledUrl).toContain("siteUrl=https%3A%2F%2Fexample.com%2F");
    });

    it("maps NotAuthorized / InvalidUrl to not_verified for a site call", async () => {
      for (const code of [14, 7]) {
        const error = await fail(
          verifyBingSiteAccess({
            apiKey: KEY,
            siteUrl: "https://other.com/",
            fetchImpl: async () =>
              json({ ErrorCode: code, Message: "ERROR!!! x" }, 400),
            retryDelaysMs: noDelay,
          }),
        );
        expect(error.kind).toBe("not_verified");
      }
    });

    it("maps InvalidApiKey, ThrottleIP and a missing quota object", async () => {
      const call = (response: Response) =>
        fail(
          verifyBingSiteAccess({
            apiKey: KEY,
            siteUrl: "https://example.com/",
            fetchImpl: async () => response,
            retryDelaysMs: noDelay,
          }),
        );
      expect(
        (await call(json({ ErrorCode: 3, Message: "InvalidApiKey" }, 400)))
          .kind,
      ).toBe("key_rejected");
      expect(
        (await call(json({ ErrorCode: 17, Message: "ThrottleIP" }, 400))).kind,
      ).toBe("ip_throttled");
      expect((await call(json({ d: null }))).kind).toBe("invalid_response");
    });

    it("normalizes typed sites to Bing's origin form and rejects junk", () => {
      expect(normalizeManualBingSite("example.com")).toBe(
        "https://example.com/",
      );
      expect(
        normalizeManualBingSite(" https://www.Example.com/path?q=1 "),
      ).toBe("https://www.example.com/");
      expect(normalizeManualBingSite("http://example.com:8080")).toBe(
        "http://example.com:8080/",
      );
      for (const bad of [
        "",
        "   ",
        "localhost",
        "ftp://example.com",
        "javascript:alert(1)",
        "exa mple.com",
        "https://user:pw@example.com",
        "a".repeat(2100),
      ]) {
        expect(normalizeManualBingSite(bad)).toBeNull();
      }
    });
  });
});
