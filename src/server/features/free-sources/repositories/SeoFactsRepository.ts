import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { seoDailyFacts, sourceSyncRuns } from "@/db/schema";

type SyncSource = "gsc" | "ga4" | "bing_webmaster" | "bing_links";
type SyncCompleteness = "complete" | "partial" | "sampled" | "unknown";

export type SeoDailyFactInsert = {
  id: string;
  projectId: string;
  organizationId: string;
  propertyId: string;
  source: "gsc" | "ga4" | "bing_webmaster";
  factDate: string;
  grainType: "site" | "page" | "query" | "query_page";
  grainKey: string;
  query: string | null;
  pageUrl: string | null;
  normalizedUrl: string | null;
  country: string | null;
  device: string | null;
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  averagePosition: number | null;
  organicSessions: number | null;
  keyEvents: number | null;
  provenance: string;
  syncRunId: string | null;
};

export const SeoFactsRepository = {
  async createSyncRun(input: {
    id: string;
    projectId: string;
    organizationId: string;
    source: SyncSource;
    periodStart?: string;
    periodEnd?: string;
    completeness?: SyncCompleteness;
    coverageInfo?: string;
  }) {
    const now = new Date().toISOString();
    const [row] = await db
      .insert(sourceSyncRuns)
      .values({
        id: input.id,
        projectId: input.projectId,
        organizationId: input.organizationId,
        source: input.source,
        state: "running",
        requestedAt: now,
        startedAt: now,
        periodStart: input.periodStart ?? null,
        periodEnd: input.periodEnd ?? null,
        rowCount: 0,
        completeness: input.completeness ?? "unknown",
        coverageInfo: input.coverageInfo ?? null,
      })
      .returning();
    return row;
  },

  async completeSyncRun(input: {
    id: string;
    projectId: string;
    rowCount: number;
    completeness: SyncCompleteness;
    coverageInfo?: string;
  }) {
    const now = new Date().toISOString();
    const [row] = await db
      .update(sourceSyncRuns)
      .set({
        state: "completed",
        completedAt: now,
        rowCount: input.rowCount,
        completeness: input.completeness,
        coverageInfo: input.coverageInfo ?? null,
      })
      .where(
        and(
          eq(sourceSyncRuns.id, input.id),
          eq(sourceSyncRuns.projectId, input.projectId),
        ),
      )
      .returning();
    return row;
  },

  async failSyncRun(input: {
    id: string;
    projectId: string;
    errorCode: string;
    errorMessage: string;
  }) {
    const now = new Date().toISOString();
    const [row] = await db
      .update(sourceSyncRuns)
      .set({
        state: "failed",
        completedAt: now,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
      })
      .where(
        and(
          eq(sourceSyncRuns.id, input.id),
          eq(sourceSyncRuns.projectId, input.projectId),
        ),
      )
      .returning();
    return row;
  },

  async listSyncRuns(projectId: string, source?: SyncSource, limit = 20) {
    const conditions = [eq(sourceSyncRuns.projectId, projectId)];
    if (source) conditions.push(eq(sourceSyncRuns.source, source));
    return db
      .select()
      .from(sourceSyncRuns)
      .where(and(...conditions))
      .orderBy(desc(sourceSyncRuns.requestedAt))
      .limit(limit);
  },

  async upsertDailyFacts(facts: SeoDailyFactInsert[]) {
    if (facts.length === 0) return 0;
    const now = new Date().toISOString();
    const chunkSize = 100;
    for (let i = 0; i < facts.length; i += chunkSize) {
      const chunk = facts.slice(i, i + chunkSize);
      for (const fact of chunk) {
        await db
          .insert(seoDailyFacts)
          .values({
            ...fact,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              seoDailyFacts.projectId,
              seoDailyFacts.source,
              seoDailyFacts.grainKey,
            ],
            set: {
              clicks: fact.clicks,
              impressions: fact.impressions,
              ctr: fact.ctr,
              averagePosition: fact.averagePosition,
              organicSessions: fact.organicSessions,
              keyEvents: fact.keyEvents,
              provenance: fact.provenance,
              syncRunId: fact.syncRunId,
              updatedAt: now,
            },
          });
      }
    }
    return facts.length;
  },

  async listDailyFacts(input: {
    projectId: string;
    source?: "gsc" | "ga4" | "bing_webmaster";
    grainType?: "site" | "page" | "query" | "query_page";
    startDate?: string;
    endDate?: string;
    limit?: number;
  }) {
    const conditions = [eq(seoDailyFacts.projectId, input.projectId)];
    if (input.source) conditions.push(eq(seoDailyFacts.source, input.source));
    if (input.grainType)
      conditions.push(eq(seoDailyFacts.grainType, input.grainType));
    if (input.startDate)
      conditions.push(gte(seoDailyFacts.factDate, input.startDate));
    if (input.endDate)
      conditions.push(lte(seoDailyFacts.factDate, input.endDate));

    return db
      .select()
      .from(seoDailyFacts)
      .where(and(...conditions))
      .orderBy(desc(seoDailyFacts.factDate))
      .limit(input.limit ?? 5000);
  },
};
