import { describe, expect, it, vi } from "vitest";
import type { WorkflowStep } from "cloudflare:workers";
import { runOpenSerpRankCheck } from "./openSerpRankCheck";

const mocks = vi.hoisted(() => ({
  reserveOpenSerpRequest: vi.fn(),
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
