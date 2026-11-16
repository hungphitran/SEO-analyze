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
