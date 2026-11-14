import { afterEach, describe, expect, it, vi } from "vitest";

const runPagespeedReport = vi.hoisted(() => vi.fn());
const resolveLighthouseProvider = vi.hoisted(() => vi.fn());
const createDataforseoClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/lib/free-sources/pagespeed", async (importOriginal) => ({
  ...(await importOriginal()),
  runPagespeedReport,
}));

vi.mock("@/server/lib/free-sources/mode", async (importOriginal) => ({
  ...(await importOriginal()),
  resolveLighthouseProvider,
}));

vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: createDataforseoClientMock,
}));

vi.mock("@/server/lib/r2", () => ({
  putTextToR2: vi.fn(),
}));

import { fetchLighthouseResult } from "./lighthouse";

const billingCustomer = {
  userId: "user-1",
  userEmail: "test@example.com",
  organizationId: "org-1",
};

describe("fetchLighthouseResult pagespeed provider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses PageSpeed Insights and never constructs a DataForSEO client", async () => {
    vi.stubEnv("PAGESPEED_API_KEY", "psi-test-key");
    resolveLighthouseProvider.mockResolvedValue("pagespeed");
    runPagespeedReport.mockResolvedValue({
      scores: {
        performanceScore: 80,
        accessibilityScore: 81,
        bestPracticesScore: 82,
        seoScore: 83,
        lcpMs: 2000,
        cls: 0.1,
        inpMs: 150,
        ttfbMs: 200,
        requestedUrl: "https://example.com/",
        fetchTime: "2026-11-11T00:00:00.000Z",
      },
      report: { version: 2, source: "pagespeed-insights" },
    });

    const fetched = await fetchLighthouseResult(
      "https://example.com/",
      "page-1",
      "mobile",
      billingCustomer,
    );

    expect(createDataforseoClientMock).not.toHaveBeenCalled();
    expect(runPagespeedReport).toHaveBeenCalledWith({
      url: "https://example.com/",
      strategy: "mobile",
      apiKey: "psi-test-key",
    });
    expect(fetched.result.performanceScore).toBe(80);
    expect(fetched.result.errorMessage).toBeUndefined();
    // The stored payload is the report itself, so the details screen can read it.
    expect(JSON.parse(fetched.payloadJson ?? "null")).toEqual({
      version: 2,
      source: "pagespeed-insights",
    });
  });
});
