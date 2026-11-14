import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ownedSiteSourceSnapshots } from "@/db/schema";
import type { FreeOwnedSiteSource } from "@/shared/free-sources-mode";

type OwnedSiteSourceSnapshot = typeof ownedSiteSourceSnapshots.$inferSelect;

type OwnedSiteSnapshotStatus = "ok" | "skipped" | "error";

async function listByProjectId(
  projectId: string,
): Promise<OwnedSiteSourceSnapshot[]> {
  return db
    .select()
    .from(ownedSiteSourceSnapshots)
    .where(eq(ownedSiteSourceSnapshots.projectId, projectId));
}

async function upsert(input: {
  projectId: string;
  organizationId: string;
  source: FreeOwnedSiteSource;
  status: OwnedSiteSnapshotStatus;
  summaryJson: string | null;
  message: string | null;
  fetchedAt: string;
}): Promise<OwnedSiteSourceSnapshot> {
  const [row] = await db
    .insert(ownedSiteSourceSnapshots)
    .values({ id: crypto.randomUUID(), ...input })
    .onConflictDoUpdate({
      target: [
        ownedSiteSourceSnapshots.projectId,
        ownedSiteSourceSnapshots.source,
      ],
      set: {
        organizationId: input.organizationId,
        status: input.status,
        summaryJson: input.summaryJson,
        message: input.message,
        fetchedAt: input.fetchedAt,
      },
    })
    .returning();
  if (!row) {
    throw new Error("Failed to upsert owned_site_source_snapshot");
  }
  return row;
}

async function deleteByProjectId(projectId: string): Promise<void> {
  await db
    .delete(ownedSiteSourceSnapshots)
    .where(eq(ownedSiteSourceSnapshots.projectId, projectId));
}

export const OwnedSiteSnapshotRepository = {
  listByProjectId,
  upsert,
  deleteByProjectId,
};
