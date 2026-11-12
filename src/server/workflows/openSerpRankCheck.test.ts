import type * as SerpApiModule from "@/server/lib/serpapi";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SerpApiError } from "@/server/lib/serpapi";
import type { WorkflowStep } from "cloudflare:workers";
import { runOpenSerpRankCheck } from "./openSerpRankCheck";

const mocks = vi.hoisted(() => ({
  reserveOpenSerpRequest: vi.fn(),
  insertOpenSerpSnapshot: vi.fn(),
  insertSnapshots: vi.fn(),
  insertOpenSerpFailure: vi.fn(),
  setRunErrorIfEmpty: vi.fn(),
  updateRun: vi.fn(),
}));

vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({
    RankTrackingRepository: mocks,
  }),
);
const serpApi = vi.hoisted(() => ({ searchSerpApi: vi.fn() }));
vi.mock("@/server/lib/serpapi", async () => {
  const actual = await vi.importActual<typeof SerpApiModule>("@/server/lib/serpapi");
  return { ...actual, searchSerpApi: serpApi.searchSerpApi };
});
vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: vi.fn(),
  getCached: vi.fn(),
  setCached: vi.fn(),
}));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: vi.fn(async () => undefined),
}));
vi.mock("@/server/lib/free-sources/mode", () => ({
  isFreeSourcesOnly: vi.fn(async () => false),
}));
vi.mock("@/server/workflows/pgStep", () => ({
  pgStep: async (
    _step: unknown,
    _name: string,
    _config: unknown,
    work: () => unknown,
  ) => work(),
}));

const snapshot = (hosts: string[]) => ({
  provider: "serpapi" as const,
  keyword: "seo",
  region: "US",
  lang: "en",
  fetchedAt: "2026-11-12T00:00:00.000Z",
  results: hosts.map((hostname, i) => ({
    organicRank: i + 1,
    absolutePosition: null,
    title: "t",
    url: `https://${hostname}/`,
    hostname,
    registrableDomain: null,
    snippet: "",
  })),
  serpFeatures: [],
  limitRequested: 10,
  resultsReturned: hosts.length,
});

describe("OpenSERP rank checks", () => {
  it("records unsupported targeting without reserving quota", async () => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- pgStep mock executes without inspecting the workflow step
    const step = {} as WorkflowStep;

    await runOpenSerpRankCheck(step, {
      runId: "run_1",
      projectId: "project_1",
      configId: "config_1",
      domain: "example.com",
      locationCode: 2840,
      languageCode: "en",
      locationName: "San Francisco",
      serpDepth: 10,
      keywords: [{ id: "keyword_1", keyword: "seo" }],
    });

    expect(mocks.reserveOpenSerpRequest).not.toHaveBeenCalled();
    expect(mocks.insertOpenSerpFailure).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "unsupported_targeting" }),
    );
  });
});

describe("SerpApi rank checks", () => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- pgStep mock executes without inspecting the workflow step
  const step = {} as WorkflowStep;
  const base = {
    runId: "run_1",
    sourceProvider: "serpapi" as const,
    projectId: "project_1",
    configId: "config_1",
    domain: "example.com",
    locationCode: 2840,
    languageCode: "en",
    serpDepth: 10,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records the organic rank for a matching domain (www/https/subdomain forms)", async () => {
    serpApi.searchSerpApi.mockResolvedValue(
      snapshot(["a.com", "blog.example.com", "b.com"]),
    );
    await runOpenSerpRankCheck(step, {
      ...base,
      domain: "https://WWW.Example.com/some/path",
      keywords: [{ id: "k1", keyword: "seo" }],
    });
    expect(mocks.insertSnapshots).toHaveBeenCalledWith([
      expect.objectContaining({
        position: 2,
        keyword: "seo",
        device: "desktop",
      }),
    ]);
    expect(mocks.insertOpenSerpFailure).not.toHaveBeenCalled();
  });

  it("records 'not ranked' as a null position, never 0 or a guess", async () => {
    serpApi.searchSerpApi.mockResolvedValue(
      snapshot(["a.com", "notexample.com", "example.com.evil.io"]),
    );
    await runOpenSerpRankCheck(step, {
      ...base,
      keywords: [{ id: "k1", keyword: "seo" }],
    });
    const rows = mocks.insertSnapshots.mock.calls[0][0];
    expect(rows[0].position).toBeNull();
    expect(rows[0].url).toBeNull();
  });

  it("refuses an unusable tracked domain before spending quota", async () => {
    await runOpenSerpRankCheck(step, {
      ...base,
      domain: "   ",
      keywords: [{ id: "k1", keyword: "seo" }],
    });
    expect(serpApi.searchSerpApi).not.toHaveBeenCalled();
    expect(mocks.insertSnapshots).not.toHaveBeenCalled();
    expect(mocks.insertOpenSerpFailure).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "invalid_input" }),
    );
  });

  it.each([
    "configuration_error",
    "timeout",
    "upstream_error",
    "no_results_unverified",
    "invalid_response",
  ] as const)(
    "records %s as an error and never writes a rank",
    async (code) => {
      serpApi.searchSerpApi.mockRejectedValue(new SerpApiError(code, "boom"));
      await runOpenSerpRankCheck(step, {
        ...base,
        keywords: [
          { id: "k1", keyword: "one" },
          { id: "k2", keyword: "two" },
        ],
      });
      expect(mocks.insertSnapshots).not.toHaveBeenCalled();
      expect(mocks.insertOpenSerpSnapshot).not.toHaveBeenCalled();
      expect(mocks.insertOpenSerpFailure).toHaveBeenCalledTimes(2);
      expect(mocks.insertOpenSerpFailure).toHaveBeenCalledWith(
        expect.objectContaining({ errorCode: code }),
      );
    },
  );

  it.each(["quota_exceeded", "rate_limited"] as const)(
    "stops the run after %s instead of burning the remaining keywords",
    async (code) => {
      serpApi.searchSerpApi.mockRejectedValue(new SerpApiError(code, "limit"));
      await runOpenSerpRankCheck(step, {
        ...base,
        keywords: [
          { id: "k1", keyword: "one" },
          { id: "k2", keyword: "two" },
          { id: "k3", keyword: "three" },
        ],
      });
      expect(serpApi.searchSerpApi).toHaveBeenCalledTimes(1);
      expect(mocks.insertSnapshots).not.toHaveBeenCalled();
    },
  );

  it("keeps going after an unrelated keyword failure", async () => {
    serpApi.searchSerpApi
      .mockRejectedValueOnce(new SerpApiError("timeout", "slow"))
      .mockResolvedValueOnce(snapshot(["example.com"]));
    await runOpenSerpRankCheck(step, {
      ...base,
      keywords: [
        { id: "k1", keyword: "one" },
        { id: "k2", keyword: "two" },
      ],
    });
    expect(mocks.insertOpenSerpFailure).toHaveBeenCalledTimes(1);
    expect(mocks.insertSnapshots).toHaveBeenCalledTimes(1);
  });

  it("treats an unexpected non-provider error as upstream_error without leaking its text", async () => {
    serpApi.searchSerpApi.mockRejectedValue(new Error("secret api_key=abc"));
    await runOpenSerpRankCheck(step, {
      ...base,
      keywords: [{ id: "k1", keyword: "one" }],
    });
    expect(mocks.setRunErrorIfEmpty).toHaveBeenCalledWith(
      "run_1",
      expect.not.stringContaining("api_key"),
    );
  });
});
