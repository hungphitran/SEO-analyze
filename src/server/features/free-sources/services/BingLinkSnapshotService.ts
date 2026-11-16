import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bingLinkSnapshots } from "@/db/schema";

type BingLinkSampleRow = {
  targetUrl: string;
  referringDomain: string;
  referringUrl: string | null;
  anchorText: string | null;
  linkCount: number;
};

type BingLinkSampleDiff = {
  scopeNote: string;
  latestBatchKey: string | null;
  previousBatchKey: string | null;
  discovered: BingLinkSampleRow[];
  lost: BingLinkSampleRow[];
  unchangedCount: number;
};

function bingLinkKey(r: BingLinkSampleRow): string {
  return `${r.referringDomain}|${r.targetUrl}|${r.anchorText ?? ""}`;
}

export function diffBingLinkBatches(
  latest: BingLinkSampleRow[],
  previous: BingLinkSampleRow[],
  latestBatchKey: string | null,
  previousBatchKey: string | null,
): BingLinkSampleDiff {
  const prevMap = new Map(previous.map((r) => [bingLinkKey(r), r] as const));
  const currMap = new Map(latest.map((r) => [bingLinkKey(r), r] as const));

  const discovered: BingLinkSampleRow[] = [];
  const lost: BingLinkSampleRow[] = [];
  let unchangedCount = 0;

  for (const [k, row] of currMap.entries()) {
    if (!prevMap.has(k)) discovered.push(row);
    else unchangedCount += 1;
  }
  for (const [k, row] of prevMap.entries()) {
    if (!currMap.has(k)) lost.push(row);
  }

  return {
    scopeNote:
      "Bing observed sample — chỉ phản ánh tập mẫu do Bing Webmaster API trả về, không phải số lượng backlink toàn Internet.",
    latestBatchKey,
    previousBatchKey,
    discovered,
    lost,
    unchangedCount,
  };
}

export async function recordBingLinkSnapshot(input: {
  projectId: string;
  organizationId: string;
  rows: BingLinkSampleRow[];
}) {
  if (input.rows.length === 0) return null;
  const fetchedAt = new Date().toISOString();
  const batchKey = crypto.randomUUID();
  for (const row of input.rows) {
    await db.insert(bingLinkSnapshots).values({
      id: crypto.randomUUID(),
      projectId: input.projectId,
      organizationId: input.organizationId,
      batchKey,
      fetchedAt,
      targetUrl: row.targetUrl,
      referringDomain: row.referringDomain,
      referringUrl: row.referringUrl,
      anchorText: row.anchorText,
      linkCount: row.linkCount,
    });
  }
  return { batchKey, fetchedAt, count: input.rows.length };
}

export async function getBingLinkSampleHistory(projectId: string) {
  const rows = await db
    .select()
    .from(bingLinkSnapshots)
    .where(eq(bingLinkSnapshots.projectId, projectId))
    .orderBy(desc(bingLinkSnapshots.fetchedAt))
    .limit(500);

  const batchKeys: string[] = [];
  for (const r of rows) {
    if (!batchKeys.includes(r.batchKey)) batchKeys.push(r.batchKey);
  }
  const latestKey = batchKeys[0] ?? null;
  const prevKey = batchKeys[1] ?? null;
  const latestRows = latestKey
    ? rows.filter((r) => r.batchKey === latestKey)
    : [];
  const prevRows = prevKey ? rows.filter((r) => r.batchKey === prevKey) : [];

  return diffBingLinkBatches(latestRows, prevRows, latestKey, prevKey);
}
