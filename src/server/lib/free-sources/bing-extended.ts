import {
  asArray,
  asRecord,
  aggregateBingRankRows,
  bingGet,
  numberOrZero,
  numberOrNull,
  stringField,
} from "@/server/lib/free-sources/bing";

export type BingPageStat = {
  url: string;
  clicks: number;
  impressions: number;
  avgImpressionPosition: number | null;
  avgClickPosition: number | null;
};

export type BingPageSummary = {
  siteUrl: string;
  pageCount: number;
  pages: BingPageStat[];
};

export type BingLinkCountItem = {
  url: string;
  count: number;
};

export type BingLinkCountsSummary = {
  siteUrl: string;
  totalLinks: number;
  links: BingLinkCountItem[];
};

export type BingCrawlIssueItem = {
  url: string;
  httpCode: number | null;
  issues: string;
  inLinks: number;
};

export type BingCrawlIssuesSummary = {
  siteUrl: string;
  issueCount: number;
  items: BingCrawlIssueItem[];
};

export function parseBingPageStatsPayload(
  payload: unknown,
  siteUrl: string,
  options?: { sinceMs?: number; limit?: number },
): BingPageSummary {
  // Bing's GetPageStats returns the page URL in `Query` on some endpoints and `Url` on others.
  const pages: BingPageStat[] = aggregateBingRankRows(
    payload,
    (record) =>
      (stringField(record, "Query") ?? stringField(record, "Url") ?? "").trim(),
    options,
  ).map(({ key, ...stat }) => ({ url: key, ...stat }));

  return {
    siteUrl,
    pageCount: pages.length,
    pages,
  };
}

export async function getBingPageStats(input: {
  apiKey: string;
  siteUrl: string;
  fetchImpl?: typeof fetch;
  retryDelaysMs?: number[];
  sinceMs?: number;
  limit?: number;
}): Promise<BingPageSummary> {
  return bingGet({
    method: "GetPageStats",
    apiKey: input.apiKey,
    params: { siteUrl: input.siteUrl },
    fetchImpl: input.fetchImpl,
    retryDelaysMs: input.retryDelaysMs,
    siteScoped: true,
    map: (payload) =>
      parseBingPageStatsPayload(payload, input.siteUrl, {
        sinceMs: input.sinceMs,
        limit: input.limit,
      }),
  });
}

export function parseBingLinkCountsPayload(
  payload: unknown,
  siteUrl: string,
  options?: { limit?: number },
): BingLinkCountsSummary {
  const limit = options?.limit ?? 25;
  const d = asRecord(payload)?.d;
  const rawRows = Array.isArray(d) ? d : asArray(asRecord(d)?.Links);
  const items: BingLinkCountItem[] = [];

  for (const row of rawRows) {
    const record = asRecord(row);
    if (!record) continue;
    const url = (
      stringField(record, "Url") ??
      stringField(record, "TargetUrl") ??
      ""
    ).trim();
    if (!url) continue;
    const count = numberOrZero(
      record.Count ?? record.LinkCount ?? record.Links,
    );
    items.push({ url, count });
  }

  items.sort((a, b) => b.count - a.count);
  const links = items.slice(0, limit);
  const totalLinks = items.reduce((sum, item) => sum + item.count, 0);

  return {
    siteUrl,
    totalLinks,
    links,
  };
}

export async function getBingLinkCounts(input: {
  apiKey: string;
  siteUrl: string;
  fetchImpl?: typeof fetch;
  retryDelaysMs?: number[];
  limit?: number;
}): Promise<BingLinkCountsSummary> {
  return bingGet({
    method: "GetLinkCounts",
    apiKey: input.apiKey,
    params: { siteUrl: input.siteUrl, page: "0" },
    fetchImpl: input.fetchImpl,
    retryDelaysMs: input.retryDelaysMs,
    siteScoped: true,
    map: (payload) =>
      parseBingLinkCountsPayload(payload, input.siteUrl, {
        limit: input.limit,
      }),
  });
}

export function parseBingCrawlIssuesPayload(
  payload: unknown,
  siteUrl: string,
  options?: { limit?: number },
): BingCrawlIssuesSummary {
  const limit = options?.limit ?? 25;
  const items: BingCrawlIssueItem[] = [];

  for (const row of asArray(asRecord(payload)?.d)) {
    const record = asRecord(row);
    if (!record) continue;
    const url = (stringField(record, "Url") ?? "").trim();
    if (!url) continue;
    const rawIssues = record.Issues;
    const issues =
      typeof rawIssues === "string" || typeof rawIssues === "number"
        ? String(rawIssues).trim() || "Unknown"
        : "Unknown";
    items.push({
      url,
      httpCode: numberOrNull(record.HttpCode),
      issues,
      inLinks: numberOrZero(record.InLinks),
    });
  }

  return {
    siteUrl,
    issueCount: items.length,
    items: items.slice(0, limit),
  };
}

export async function getBingCrawlIssues(input: {
  apiKey: string;
  siteUrl: string;
  fetchImpl?: typeof fetch;
  retryDelaysMs?: number[];
  limit?: number;
}): Promise<BingCrawlIssuesSummary> {
  return bingGet({
    method: "GetCrawlIssues",
    apiKey: input.apiKey,
    params: { siteUrl: input.siteUrl },
    fetchImpl: input.fetchImpl,
    retryDelaysMs: input.retryDelaysMs,
    siteScoped: true,
    map: (payload) =>
      parseBingCrawlIssuesPayload(payload, input.siteUrl, {
        limit: input.limit,
      }),
  });
}
