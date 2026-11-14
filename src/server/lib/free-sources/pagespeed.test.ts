import { describe, expect, it, vi } from "vitest";
import {
  PAGESPEED_ENDPOINT,
  PagespeedError,
  parsePagespeedPayload,
  runPagespeedAudit,
} from "./pagespeed";

const fixture = {
  lighthouseResult: {
    requestedUrl: "https://example.com/",
    fetchTime: "2026-11-11T00:00:00.000Z",
    categories: {
      performance: { score: 0.91 },
      accessibility: { score: 0.88 },
      "best-practices": { score: 0.79 },
      seo: { score: 1 },
    },
    audits: {
      "largest-contentful-paint": { numericValue: 2400 },
      "cumulative-layout-shift": { numericValue: 0.05 },
      "interaction-to-next-paint": { numericValue: 180 },
      "server-response-time": { numericValue: 120 },
    },
  },
};

describe("parsePagespeedPayload", () => {
  it("maps Lighthouse categories and audits", () => {
    expect(parsePagespeedPayload(fixture)).toEqual({
      performanceScore: 91,
      accessibilityScore: 88,
      bestPracticesScore: 79,
      seoScore: 100,
      lcpMs: 2400,
      cls: 0.05,
      inpMs: 180,
      ttfbMs: 120,
      requestedUrl: "https://example.com/",
      fetchTime: "2026-11-11T00:00:00.000Z",
    });
  });

  it("returns nulls for an empty payload instead of inventing scores", () => {
    expect(parsePagespeedPayload({})).toMatchObject({
      performanceScore: null,
      seoScore: null,
      lcpMs: null,
    });
  });
});

describe("runPagespeedAudit", () => {
  it("sends the API key in a header and never as a query parameter", async () => {
    let apiKeyHeader: string | null = null;
    const fetchImpl = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : input);
        expect(url.origin + url.pathname).toBe(PAGESPEED_ENDPOINT);
        expect(url.searchParams.get("url")).toBe("https://example.com/");
        expect(url.searchParams.get("strategy")).toBe("mobile");
        expect(url.searchParams.get("key")).toBeNull();
        expect(url.searchParams.getAll("category")).toEqual([
          "performance",
          "accessibility",
          "best-practices",
          "seo",
        ]);
        apiKeyHeader = new Headers(init?.headers).get("X-goog-api-key");
        return new Response(JSON.stringify(fixture), { status: 200 });
      },
    );

    const result = await runPagespeedAudit({
      url: "https://example.com/",
      strategy: "mobile",
      apiKey: "test-psi-key",
      fetchImpl: fetchImpl,
    });

    expect(result.performanceScore).toBe(91);
    expect(apiKeyHeader).toBe("test-psi-key");
  });

  it("marks HTTP 429 as retryable and never includes the key in the error", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { message: "Quota exceeded for queries per day" },
          }),
          { status: 429 },
        ),
    );

    try {
      await runPagespeedAudit({
        url: "https://example.com/",
        strategy: "desktop",
        apiKey: "super-secret-key",
        fetchImpl: fetchImpl,
      });
      throw new Error("expected PagespeedError");
    } catch (error) {
      expect(error).toBeInstanceOf(PagespeedError);
      if (error instanceof PagespeedError) {
        expect(error.status).toBe(429);
        expect(error.retryable).toBe(true);
        expect(error.message).not.toContain("super-secret-key");
      }
    }
  });

  it("refuses to call the API without a key", async () => {
    const fetchImpl = vi.fn();
    await expect(
      runPagespeedAudit({
        url: "https://example.com/",
        strategy: "mobile",
        apiKey: "  ",
        fetchImpl: fetchImpl,
      }),
    ).rejects.toBeInstanceOf(PagespeedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
