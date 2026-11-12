import { and, asc, desc, eq, gte, inArray, lt, max, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  openSerpResults,
  openSerpSnapshots,
  openSerpUsage,
  rankTrackingKeywords,
} from "@/db/schema";
import { DB_BATCH_SIZE, executeInBatches } from "@/db/runBatch";
import type {
  OpenSerpErrorCode,
  OpenSerpSnapshot,
} from "@/server/lib/openserp";

export async function insertOpenSerpSnapshot(input: {
  id: string;
  runId: string;
  projectId: string;
  configId: string;
  trackingKeywordId: string;
  snapshot: OpenSerpSnapshot;
}) {
  const { snapshot } = input;
  await db
    .insert(openSerpSnapshots)
    .values({
      id: input.id,
      runId: input.runId,
      projectId: input.projectId,
      configId: input.configId,
      trackingKeywordId: input.trackingKeywordId,
      keyword: snapshot.keyword,
      engine: "google",
      region: snapshot.region,
      lang: snapshot.lang,
      requestId: snapshot.requestId ?? null,
      status: "success",
      limitRequested: snapshot.limitRequested,
      resultsReturned: snapshot.resultsReturned,
      fetchedAt: snapshot.fetchedAt,
    })
    .onConflictDoNothing({
      target: [openSerpSnapshots.runId, openSerpSnapshots.trackingKeywordId],
    });

  await executeInBatches(
    snapshot.results.map((result) => ({
      snapshotId: input.id,
      sourceId: result.sourceId ?? null,
      organicRank: result.organicRank,
      absolutePosition: result.absolutePosition,
      title: result.title,
      url: result.url,
      hostname: result.hostname,
      registrableDomain: result.registrableDomain,
      snippet: result.snippet,
    })),
    (tx, result) =>
      tx
        .insert(openSerpResults)
        .values(result)
        .onConflictDoNothing({
          target: [openSerpResults.snapshotId, openSerpResults.organicRank],
        }),
  );
}

export async function insertOpenSerpFailure(input: {
  id: string;
  runId: string;
  projectId: string;
  configId: string;
  trackingKeywordId: string;
  keyword: string;
  region: string;
  lang: string;
  limitRequested: number;
  errorCode: OpenSerpErrorCode;
  requestId?: string;
}) {
  await db
    .insert(openSerpSnapshots)
    .values({
      id: input.id,
      runId: input.runId,
      projectId: input.projectId,
      configId: input.configId,
      trackingKeywordId: input.trackingKeywordId,
      keyword: input.keyword,
      engine: "google",
      region: input.region,
      lang: input.lang,
      requestId: input.requestId ?? null,
      status: input.errorCode,
      errorCode: input.errorCode,
      limitRequested: input.limitRequested,
      resultsReturned: 0,
    })
    .onConflictDoNothing({
      target: [openSerpSnapshots.runId, openSerpSnapshots.trackingKeywordId],
    });
}

export async function reserveOpenSerpRequest(
  projectId: string,
  dailyLimit: number,
  usageDate = new Date().toISOString().slice(0, 10),
) {
  const rows = await db
    .insert(openSerpUsage)
    .values({ projectId, usageDate, requests: 1 })
    .onConflictDoUpdate({
      target: [openSerpUsage.projectId, openSerpUsage.usageDate],
      set: { requests: sql`${openSerpUsage.requests} + 1` },
      setWhere: lt(openSerpUsage.requests, dailyLimit),
    })
    .returning({ requests: openSerpUsage.requests });
  return rows.length > 0;
}

export async function getOpenSerpKeywordsForConfig(
  configId: string,
  limit: number,
) {
  const [keywords, latestSnapshots] = await Promise.all([
    db
      .select({
        id: rankTrackingKeywords.id,
        createdAt: rankTrackingKeywords.createdAt,
      })
      .from(rankTrackingKeywords)
      .where(eq(rankTrackingKeywords.configId, configId))
      .orderBy(asc(rankTrackingKeywords.createdAt)),
    db
      .select({
        trackingKeywordId: openSerpSnapshots.trackingKeywordId,
        fetchedAt: max(openSerpSnapshots.fetchedAt),
      })
      .from(openSerpSnapshots)
      .where(
        and(
          eq(openSerpSnapshots.configId, configId),
          eq(openSerpSnapshots.status, "success"),
        ),
      )
      .groupBy(openSerpSnapshots.trackingKeywordId),
  ]);
  const fetchedAtByKeyword = new Map(
    latestSnapshots.map((snapshot) => [
      snapshot.trackingKeywordId,
      snapshot.fetchedAt ?? "",
    ]),
  );
  // oxlint-disable-next-line eslint-plugin-unicorn/no-array-sort -- the Worker TypeScript target is ES2022
  keywords.sort((a, b) => {
    const byFreshness = (fetchedAtByKeyword.get(a.id) ?? "").localeCompare(
      fetchedAtByKeyword.get(b.id) ?? "",
    );
    return byFreshness || a.createdAt.localeCompare(b.createdAt);
  });
  return keywords.slice(0, limit).map((keyword) => keyword.id);
}

export async function getOpenSerpSnapshotsForConfig(input: {
  projectId: string;
  configId: string;
  since: string;
}) {
  return db
    .select({
      id: openSerpSnapshots.id,
      trackingKeywordId: openSerpSnapshots.trackingKeywordId,
      keyword: openSerpSnapshots.keyword,
      fetchedAt: openSerpSnapshots.fetchedAt,
      region: openSerpSnapshots.region,
      lang: openSerpSnapshots.lang,
      status: openSerpSnapshots.status,
      errorCode: openSerpSnapshots.errorCode,
      limitRequested: openSerpSnapshots.limitRequested,
      resultsReturned: openSerpSnapshots.resultsReturned,
    })
    .from(openSerpSnapshots)
    .where(
      and(
        eq(openSerpSnapshots.projectId, input.projectId),
        eq(openSerpSnapshots.configId, input.configId),
        eq(openSerpSnapshots.status, "success"),
        gte(openSerpSnapshots.fetchedAt, input.since),
      ),
    )
    .orderBy(desc(openSerpSnapshots.fetchedAt));
}

export async function getOpenSerpResultsForSnapshots(snapshotIds: string[]) {
  const rows: Array<{
    snapshotId: string;
    organicRank: number;
    absolutePosition: number | null;
    url: string;
    hostname: string;
    registrableDomain: string | null;
  }> = [];
  for (let i = 0; i < snapshotIds.length; i += DB_BATCH_SIZE) {
    const chunk = snapshotIds.slice(i, i + DB_BATCH_SIZE);
    rows.push(
      ...(await db
        .select({
          snapshotId: openSerpResults.snapshotId,
          organicRank: openSerpResults.organicRank,
          absolutePosition: openSerpResults.absolutePosition,
          url: openSerpResults.url,
          hostname: openSerpResults.hostname,
          registrableDomain: openSerpResults.registrableDomain,
        })
        .from(openSerpResults)
        .where(inArray(openSerpResults.snapshotId, chunk))),
    );
  }
  return rows;
}
