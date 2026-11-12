import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { toRankTrackingTimestamp } from "@/server/features/rank-tracking/rankTrackingTimestamps";
import { AppError } from "@/server/lib/errors";
import type { ComparePeriod } from "@/types/schemas/rank-tracking-search";
import type {
  RankTrackingDeviceResult,
  RankTrackingRow,
} from "@/types/schemas/rank-tracking";

type SnapshotRow = Awaited<
  ReturnType<typeof RankTrackingRepository.getLatestSnapshotsForKeywords>
>[0];

const PERIOD_DAYS: Record<ComparePeriod, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export async function getLatestResults(
  configId: string,
  projectId: string,
  comparePeriod: ComparePeriod = "7d",
): Promise<{
  rows: RankTrackingRow[];
  competitorOverlap: {
    trackedKeywords: number;
    coveredKeywords: number;
    since: string;
    domains: Array<{
      domain: string;
      keywordsPresent: number;
      appearances: number;
      bestPosition: number;
      averagePosition: number;
      sampleUrls: string[];
    }>;
  };
  run: {
    id: string;
    lastCheckedAt: string | null;
    completedAt: string | null;
    status: "pending" | "running" | "completed" | "failed";
    sourceProvider: "dataforseo" | "openserp" | null;
    errorMessage: string | null;
  } | null;
}> {
  const days = PERIOD_DAYS[comparePeriod];
  const targetDate = toRankTrackingTimestamp(
    new Date(Date.now() - days * 24 * 60 * 60 * 1000),
  );

  // All four reads key off the inputs alone, so run them in one parallel round
  // trip instead of four sequential ones — this endpoint is hot and the DB may
  // be a continent away. The project-scoped config lookup doubles as the
  // authorization gate for the configId-keyed reads racing alongside it: when
  // config is null, throw without returning anything from the other reads.
  const [
    config,
    activeKeywords,
    currentSnapshots,
    comparisonSnapshots,
    latestRun,
    openSerpSnapshots,
  ] = await Promise.all([
    RankTrackingRepository.getConfigById({ configId, projectId }),
    RankTrackingRepository.getKeywordsForConfig(configId),
    // Latest snapshot per keyword per device (across all completed runs)
    RankTrackingRepository.getLatestSnapshotsForKeywords(configId),
    // Comparison snapshots from before the target date
    RankTrackingRepository.getSnapshotsBeforeDate(configId, targetDate),
    RankTrackingRepository.getLatestRunForConfig(configId),
    RankTrackingRepository.getOpenSerpSnapshotsForConfig({
      projectId,
      configId,
      since: targetDate,
    }),
  ]);
  if (!config) {
    throw new AppError("INTERNAL_ERROR", "Rank tracking config not found");
  }

  const previousPositions = new Map<string, number | null>();
  for (const snap of comparisonSnapshots) {
    previousPositions.set(
      `${snap.trackingKeywordId}:${snap.device}`,
      snap.position,
    );
  }

  // Fallback: for keyword+device combos with no comparison snapshot before
  // the target date, use the earliest available snapshot as a baseline.
  const missingKeywordIds: string[] = [];
  for (const snap of currentSnapshots) {
    const key = `${snap.trackingKeywordId}:${snap.device}`;
    if (!previousPositions.has(key)) {
      missingKeywordIds.push(snap.trackingKeywordId);
    }
  }

  if (missingKeywordIds.length > 0) {
    const uniqueMissingIds = [...new Set(missingKeywordIds)];
    const earliestSnapshots =
      await RankTrackingRepository.getEarliestSnapshotsForKeywords(
        configId,
        uniqueMissingIds,
      );
    for (const snap of earliestSnapshots) {
      const key = `${snap.trackingKeywordId}:${snap.device}`;
      if (!previousPositions.has(key)) {
        previousPositions.set(key, snap.position);
      }
    }
  }

  // Build result rows
  const rows = new Map<string, RankTrackingRow>(
    activeKeywords.map((keyword) => [
      keyword.id,
      {
        trackingKeywordId: keyword.id,
        keyword: keyword.keyword,
        matchCase: keyword.matchCase,
        pinned: keyword.pinnedAt !== null,
        searchVolume: keyword.searchVolume,
        keywordDifficulty: keyword.keywordDifficulty,
        cpc: keyword.cpc,
        desktop: createEmptyDeviceResult(
          previousPositions.get(`${keyword.id}:desktop`) ?? null,
        ),
        mobile: createEmptyDeviceResult(
          previousPositions.get(`${keyword.id}:mobile`) ?? null,
        ),
      },
    ]),
  );

  // Freshness comes from the newest snapshot regardless of which run wrote
  // it, so a newer failed run doesn't erase the date of the results shown.
  let latestStartedAt: string | null = null;

  for (const snapshot of currentSnapshots) {
    const row = rows.get(snapshot.trackingKeywordId);
    if (!row) continue;
    row[snapshot.device] = toDeviceResult(
      snapshot,
      previousPositions.get(
        `${snapshot.trackingKeywordId}:${snapshot.device}`,
      ) ?? null,
    );

    if (!latestStartedAt || snapshot.checkedAt > latestStartedAt) {
      latestStartedAt = snapshot.checkedAt;
    }
  }

  const latestOpenSerpSnapshots: typeof openSerpSnapshots = [];
  const seenOpenSerpKeywords = new Set<string>();
  for (const snapshot of openSerpSnapshots) {
    if (seenOpenSerpKeywords.has(snapshot.trackingKeywordId)) continue;
    seenOpenSerpKeywords.add(snapshot.trackingKeywordId);
    latestOpenSerpSnapshots.push(snapshot);
  }
  const snapshotKeywords = new Map(
    latestOpenSerpSnapshots.map((snapshot) => [
      snapshot.id,
      snapshot.trackingKeywordId,
    ]),
  );
  const openSerpResults =
    await RankTrackingRepository.getOpenSerpResultsForSnapshots(
      latestOpenSerpSnapshots.map((snapshot) => snapshot.id),
    );
  const targetDomain = config.domain?.toLowerCase().replace(/^www\./, "");
  const overlapByDomain = new Map<
    string,
    {
      keywordPositions: Map<string, number>;
      appearances: number;
      sampleUrls: Set<string>;
    }
  >();
  // oxlint-disable-next-line eslint-plugin-unicorn/no-array-sort -- this array is local and the Worker target is ES2022
  for (const result of openSerpResults.sort(
    (a, b) => a.organicRank - b.organicRank,
  )) {
    const trackingKeywordId = snapshotKeywords.get(result.snapshotId);
    if (!trackingKeywordId) continue;
    const domain = result.registrableDomain ?? result.hostname;
    if (
      targetDomain &&
      (result.hostname === targetDomain ||
        result.hostname.endsWith(`.${targetDomain}`) ||
        domain === targetDomain)
    ) {
      continue;
    }
    let aggregate = overlapByDomain.get(domain);
    if (!aggregate) {
      aggregate = {
        keywordPositions: new Map(),
        appearances: 0,
        sampleUrls: new Set(),
      };
      overlapByDomain.set(domain, aggregate);
    }
    aggregate.appearances++;
    const priorPosition = aggregate.keywordPositions.get(trackingKeywordId);
    if (priorPosition === undefined || result.organicRank < priorPosition) {
      aggregate.keywordPositions.set(trackingKeywordId, result.organicRank);
    }
    if (aggregate.sampleUrls.size < 3) aggregate.sampleUrls.add(result.url);
  }
  const domains = [...overlapByDomain].map(([domain, aggregate]) => {
    const positions = [...aggregate.keywordPositions.values()];
    return {
      domain,
      keywordsPresent: positions.length,
      appearances: aggregate.appearances,
      bestPosition: Math.min(...positions),
      averagePosition:
        positions.reduce((sum, position) => sum + position, 0) /
        positions.length,
      sampleUrls: [...aggregate.sampleUrls],
    };
  });
  // oxlint-disable-next-line eslint-plugin-unicorn/no-array-sort -- this array is local and the Worker target is ES2022
  domains.sort(
    (a, b) =>
      b.keywordsPresent - a.keywordsPresent ||
      a.averagePosition - b.averagePosition ||
      a.domain.localeCompare(b.domain),
  );
  const competitorOverlap = {
    trackedKeywords: activeKeywords.length,
    coveredKeywords: latestOpenSerpSnapshots.length,
    since: targetDate,
    domains: domains.slice(0, 20),
  };

  return {
    rows: [...rows.values()],
    competitorOverlap,
    run: latestRun
      ? {
          id: latestRun.id,
          // Snapshot-derived: a run that saved zero snapshots leaves this
          // null even though it finished, so read completedAt for the run.
          lastCheckedAt: latestStartedAt,
          completedAt: latestRun.completedAt,
          status: latestRun.status,
          sourceProvider: latestRun.sourceProvider,
          errorMessage: latestRun.errorMessage,
        }
      : null,
  };
}

function parseSerpFeatures(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    // ignore
  }
  return [];
}

function createEmptyDeviceResult(
  previousPosition: number | null,
): RankTrackingDeviceResult {
  return {
    position: null,
    absolutePosition: null,
    previousPosition,
    rankingUrl: null,
    serpFeatures: [],
  };
}

function toDeviceResult(
  snapshot: SnapshotRow,
  previousPosition: number | null,
): RankTrackingDeviceResult {
  return {
    position: snapshot.position,
    absolutePosition: snapshot.absolutePosition,
    previousPosition,
    rankingUrl: snapshot.url,
    serpFeatures: parseSerpFeatures(snapshot.serpFeatures),
  };
}
