import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  keywordClusterMembers,
  keywordClusters,
  keywordOpportunities,
} from "@/db/schema";

type OpportunityStatus = "new" | "in_progress" | "resolved" | "ignored";
export type OpportunityRule =
  | "ctr_opportunity"
  | "near_top"
  | "decaying"
  | "growing"
  | "cannibalization"
  | "content_gap";

export type KeywordOpportunityInsert = {
  id: string;
  projectId: string;
  organizationId: string;
  dedupeKey: string;
  query: string;
  targetUrl: string | null;
  rule: OpportunityRule;
  score: number | null;
  scoreVersion: string;
  partialScore: boolean;
  confidence: "high" | "medium" | "low";
  evidencePeriod: string;
  evidenceJson: string;
  whySuggested: string;
};

export const KeywordOpportunityRepository = {
  async upsertMany(rows: KeywordOpportunityInsert[]) {
    if (rows.length === 0) return 0;
    const now = new Date().toISOString();
    for (const row of rows) {
      await db
        .insert(keywordOpportunities)
        .values({
          ...row,
          status: "new",
          detectedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            keywordOpportunities.projectId,
            keywordOpportunities.dedupeKey,
          ],
          set: {
            score: row.score,
            scoreVersion: row.scoreVersion,
            partialScore: row.partialScore,
            confidence: row.confidence,
            evidencePeriod: row.evidencePeriod,
            evidenceJson: row.evidenceJson,
            whySuggested: row.whySuggested,
            updatedAt: now,
          },
        });
    }
    return rows.length;
  },

  async list(input: {
    projectId: string;
    status?: OpportunityStatus;
    rule?: OpportunityRule;
    limit?: number;
  }) {
    const conditions = [eq(keywordOpportunities.projectId, input.projectId)];
    if (input.status)
      conditions.push(eq(keywordOpportunities.status, input.status));
    if (input.rule) conditions.push(eq(keywordOpportunities.rule, input.rule));

    return db
      .select()
      .from(keywordOpportunities)
      .where(and(...conditions))
      .orderBy(desc(keywordOpportunities.score))
      .limit(input.limit ?? 100);
  },

  async updateAction(input: {
    projectId: string;
    opportunityId: string;
    status: OpportunityStatus;
    note?: string | null;
    ownerUserId?: string | null;
  }) {
    const now = new Date().toISOString();
    const [updated] = await db
      .update(keywordOpportunities)
      .set({
        status: input.status,
        note: input.note ?? null,
        ownerUserId: input.ownerUserId ?? null,
        updatedAt: now,
      })
      .where(
        and(
          eq(keywordOpportunities.id, input.opportunityId),
          eq(keywordOpportunities.projectId, input.projectId),
        ),
      )
      .returning();
    return updated ?? null;
  },

  async replaceClusters(input: {
    projectId: string;
    organizationId: string;
    clusters: Array<{
      id: string;
      name: string;
      intent: string;
      algorithmVersion: string;
      confidence: string;
      evidenceCount: number;
      members: Array<{ query: string; source: string }>;
    }>;
  }) {
    await db
      .delete(keywordClusters)
      .where(eq(keywordClusters.projectId, input.projectId));

    const now = new Date().toISOString();
    for (const cluster of input.clusters) {
      await db.insert(keywordClusters).values({
        id: cluster.id,
        projectId: input.projectId,
        organizationId: input.organizationId,
        name: cluster.name,
        intent: cluster.intent,
        algorithmVersion: cluster.algorithmVersion,
        confidence: cluster.confidence,
        evidenceCount: cluster.evidenceCount,
        createdAt: now,
        updatedAt: now,
      });
      for (const member of cluster.members) {
        await db.insert(keywordClusterMembers).values({
          id: crypto.randomUUID(),
          clusterId: cluster.id,
          projectId: input.projectId,
          query: member.query,
          source: member.source,
          createdAt: now,
        });
      }
    }
    return input.clusters.length;
  },

  async listClusters(projectId: string) {
    const clusters = await db
      .select()
      .from(keywordClusters)
      .where(eq(keywordClusters.projectId, projectId))
      .orderBy(desc(keywordClusters.evidenceCount));

    const members = await db
      .select()
      .from(keywordClusterMembers)
      .where(eq(keywordClusterMembers.projectId, projectId));

    const membersByCluster = new Map<
      string,
      Array<{ query: string; source: string }>
    >();
    for (const m of members) {
      const list = membersByCluster.get(m.clusterId) ?? [];
      list.push({ query: m.query, source: m.source });
      membersByCluster.set(m.clusterId, list);
    }

    return clusters.map((c) => ({
      ...c,
      members: membersByCluster.get(c.id) ?? [],
    }));
  },
};
