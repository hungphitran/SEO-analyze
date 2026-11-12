import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLatestResults } from "./rankTrackingResults";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

const mocks = vi.hoisted(() => ({
  getConfigById: vi.fn(),
  getKeywordsForConfig: vi.fn(),
  getLatestSnapshotsForKeywords: vi.fn(),
  getSnapshotsBeforeDate: vi.fn(),
  getLatestRunForConfig: vi.fn(),
  getEarliestSnapshotsForKeywords: vi.fn(),
  getOpenSerpSnapshotsForConfig: vi.fn(),
  getOpenSerpResultsForSnapshots: vi.fn(),
}));

vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({ RankTrackingRepository: mocks }),
);

describe("getLatestResults", () => {
  beforeEach(() => {
    mocks.getConfigById.mockResolvedValue({ id: "config_1" });
    mocks.getKeywordsForConfig.mockResolvedValue([]);
    mocks.getLatestSnapshotsForKeywords.mockResolvedValue([]);
    mocks.getSnapshotsBeforeDate.mockResolvedValue([]);
    mocks.getEarliestSnapshotsForKeywords.mockResolvedValue([]);
    mocks.getOpenSerpSnapshotsForConfig.mockResolvedValue([]);
    mocks.getOpenSerpResultsForSnapshots.mockResolvedValue([]);
  });

  it("keeps snapshot freshness when a newer run fails before writing snapshots", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue([
      {
        id: "kw_1",
        keyword: "open seo",
        searchVolume: 100,
        keywordDifficulty: 10,
        cpc: 1,
      },
    ]);
    mocks.getLatestSnapshotsForKeywords.mockResolvedValue([
      {
        trackingKeywordId: "kw_1",
        device: "desktop",
        runId: "run_1",
        checkedAt: "2026-08-01 10:00:00",
        position: 3,
        url: "https://example.com/",
        serpFeatures: null,
      },
    ]);
    mocks.getLatestRunForConfig.mockResolvedValue({
      id: "run_2",
      status: "failed",
      errorMessage: "Provider request timed out",
    });

    await expect(
      getLatestResults("config_1", "project_1"),
    ).resolves.toMatchObject({
      run: {
        id: "run_2",
        lastCheckedAt: "2026-08-01 10:00:00",
        status: "failed",
        errorMessage: "Provider request timed out",
      },
    });
  });

  it("counts competitor overlap once per tracked keyword using each latest successful SERP", async () => {
    mocks.getConfigById.mockResolvedValue({
      id: "config_1",
      domain: "example.com",
    });
    mocks.getKeywordsForConfig.mockResolvedValue([
      { id: "kw_1", keyword: "one" },
      { id: "kw_2", keyword: "two" },
    ]);
    mocks.getOpenSerpSnapshotsForConfig.mockResolvedValue([
      { id: "snap_1", trackingKeywordId: "kw_1" },
      { id: "snap_2", trackingKeywordId: "kw_2" },
      { id: "older", trackingKeywordId: "kw_1" },
    ]);
    mocks.getOpenSerpResultsForSnapshots.mockResolvedValue([
      {
        snapshotId: "snap_1",
        organicRank: 2,
        url: "https://competitor.test/one",
        hostname: "competitor.test",
        registrableDomain: "competitor.test",
      },
      {
        snapshotId: "snap_1",
        organicRank: 5,
        url: "https://competitor.test/other",
        hostname: "competitor.test",
        registrableDomain: "competitor.test",
      },
      {
        snapshotId: "snap_1",
        organicRank: 1,
        url: "https://www.example.com/",
        hostname: "example.com",
        registrableDomain: "example.com",
      },
      {
        snapshotId: "snap_2",
        organicRank: 4,
        url: "https://competitor.test/two",
        hostname: "competitor.test",
        registrableDomain: "competitor.test",
      },
      {
        snapshotId: "older",
        organicRank: 1,
        url: "https://stale.test/",
        hostname: "stale.test",
        registrableDomain: "stale.test",
      },
    ]);

    const result = await getLatestResults("config_1", "project_1");

    expect(result.competitorOverlap).toMatchObject({
      trackedKeywords: 2,
      coveredKeywords: 2,
      domains: [
        {
          domain: "competitor.test",
          keywordsPresent: 2,
          appearances: 3,
          bestPosition: 2,
          averagePosition: 3,
        },
      ],
    });
  });
});
