import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bingWebmasterConnections } from "@/db/schema";

type BingWebmasterConnection = typeof bingWebmasterConnections.$inferSelect;

async function getByProjectId(
  projectId: string,
): Promise<BingWebmasterConnection | null> {
  const rows = await db
    .select()
    .from(bingWebmasterConnections)
    .where(eq(bingWebmasterConnections.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}

async function upsert(input: {
  projectId: string;
  organizationId: string;
  siteUrl: string;
  encryptedApiKey: string;
  connectedByUserId: string;
}): Promise<BingWebmasterConnection> {
  const [row] = await db
    .insert(bingWebmasterConnections)
    .values({ id: crypto.randomUUID(), ...input })
    .onConflictDoUpdate({
      target: bingWebmasterConnections.projectId,
      set: {
        siteUrl: input.siteUrl,
        organizationId: input.organizationId,
        encryptedApiKey: input.encryptedApiKey,
        connectedByUserId: input.connectedByUserId,
        updatedAt: sql`(current_timestamp)`,
      },
    })
    .returning();
  if (!row) {
    throw new Error("Failed to upsert bing_webmaster_connection");
  }
  return row;
}

async function deleteByProjectId(projectId: string): Promise<void> {
  await db
    .delete(bingWebmasterConnections)
    .where(eq(bingWebmasterConnections.projectId, projectId));
}

async function deleteByConnectedUserId(userId: string): Promise<void> {
  await db
    .delete(bingWebmasterConnections)
    .where(eq(bingWebmasterConnections.connectedByUserId, userId));
}

export const BingWebmasterConnectionRepository = {
  getByProjectId,
  upsert,
  deleteByProjectId,
  deleteByConnectedUserId,
};
