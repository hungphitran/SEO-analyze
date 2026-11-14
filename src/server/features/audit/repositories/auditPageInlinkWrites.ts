import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { executeInBatches } from "@/db/runBatch";
import { auditPages } from "@/db/schema";

/**
 * Store how many crawled pages link to each page. Only called when the link
 * graph is complete, so every page without an inbound edge really has zero;
 * pages are reset to 0 first, then the ones that do have links are set.
 */
export async function updatePageInlinkCounts(
  auditId: string,
  counts: Array<{ pageId: string; count: number }>,
) {
  await db
    .update(auditPages)
    .set({ inlinkCount: 0 })
    .where(eq(auditPages.auditId, auditId));
  await executeInBatches(counts, (tx, row) =>
    tx
      .update(auditPages)
      .set({ inlinkCount: row.count })
      .where(
        and(eq(auditPages.auditId, auditId), eq(auditPages.id, row.pageId)),
      ),
  );
}
