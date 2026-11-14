import { sort } from "remeda";
import type { GscSearchAnalyticsRow } from "@/server/lib/gscClient";

/**
 * Pure shaping helpers for the Search Performance page. Kept separate from the
 * server function so the aggregation and striking-distance rules are unit
 * testable without a GSC client.
 */

type SearchPerformanceTotals = {
  clicks: number;
  impressions: number;
  /** 0..1 (clicks / impressions). */
  ctr: number;
  /** Impression-weighted average position; 0 when there were no impressions. */
  position: number;
};

type SearchPerformanceDimensionRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type StrikingDistanceRow = {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  position: number;
};

// "Striking distance" = already ranking, not yet in the top spots: the queries
// where a content improvement most plausibly moves real traffic.
const STRIKING_DISTANCE_MIN_POSITION = 4;
const STRIKING_DISTANCE_MAX_POSITION = 20;
const STRIKING_DISTANCE_ROW_LIMIT = 100;

export function sumSearchTotals(
  rows: GscSearchAnalyticsRow[],
): SearchPerformanceTotals {
  let clicks = 0;
  let impressions = 0;
  let weightedPosition = 0;
  for (const row of rows) {
    clicks += row.clicks;
    impressions += row.impressions;
    weightedPosition += row.position * row.impressions;
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? weightedPosition / impressions : 0,
  };
}

/** Flatten single-dimension rows (query or page) into a keyed table row. */
export function toDimensionRows(
  rows: GscSearchAnalyticsRow[],
): SearchPerformanceDimensionRow[] {
  const output: SearchPerformanceDimensionRow[] = [];
  for (const row of rows) {
    const key = row.keys?.[0];
    if (!key) continue;
    output.push({
      key,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    });
  }
  return output;
}

/** Reduce `["query","page"]` rows to one striking-distance row per query.
 *
 *  GSC returns a row per page that ranks for a query, so a query fans out across
 *  every page it appears on. A query only belongs in "striking distance" when
 *  the site's BEST-ranking page for it sits in the 4..20 band — if any page
 *  already ranks above position 4, the site effectively ranks near the top and
 *  improving a secondary page won't move traffic. So we collapse each query to
 *  its top page (lowest average position; ties broken by impressions) and keep
 *  it only when that top page is in band. Result is sorted by impressions. */
export function buildStrikingDistanceRows(
  rows: GscSearchAnalyticsRow[],
  limit: number = STRIKING_DISTANCE_ROW_LIMIT,
): StrikingDistanceRow[] {
  const topPageByQuery = new Map<string, StrikingDistanceRow>();
  for (const row of rows) {
    const query = row.keys?.[0];
    const page = row.keys?.[1];
    if (!query || !page) continue;

    const current = topPageByQuery.get(query);
    const isBetter =
      !current ||
      row.position < current.position ||
      (row.position === current.position &&
        row.impressions > current.impressions);
    if (!isBetter) continue;

    topPageByQuery.set(query, {
      query,
      page,
      clicks: row.clicks,
      impressions: row.impressions,
      position: row.position,
    });
  }

  return sort(
    Array.from(topPageByQuery.values()).filter(
      (row) =>
        row.position >= STRIKING_DISTANCE_MIN_POSITION &&
        row.position <= STRIKING_DISTANCE_MAX_POSITION,
    ),
    (a, b) => b.impressions - a.impressions,
  ).slice(0, limit);
}

/** The same-length period immediately before [startDate, endDate], for the
 *  totals comparison. Dates are YYYY-MM-DD in UTC. */
export function previousPeriod(
  startDate: string,
  endDate: string,
): { startDate: string; endDate: string } {
  const dayMs = 24 * 60 * 60 * 1000;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const lengthMs = Math.max(end - start, 0);
  const prevEnd = start - dayMs;
  const prevStart = prevEnd - lengthMs;
  return {
    startDate: formatUtcDate(prevStart),
    endDate: formatUtcDate(prevEnd),
  };
}

function formatUtcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

type CannibalizationPage = {
  page: string;
  clicks: number;
  impressions: number;
  position: number;
};

type CannibalizationRow = {
  query: string;
  totalImpressions: number;
  totalClicks: number;
  pages: CannibalizationPage[];
};

// A query is "cannibalized" when two or more of the site's pages each earn a
// real share of its impressions, so they compete with each other in the SERP.
const CANNIBALIZATION_MIN_PAGE_IMPRESSIONS = 5;
const CANNIBALIZATION_MIN_PAGE_SHARE = 0.1;
const CANNIBALIZATION_MIN_QUERY_IMPRESSIONS = 30;
const CANNIBALIZATION_ROW_LIMIT = 100;
const CANNIBALIZATION_MAX_PAGES_PER_QUERY = 5;

/** Queries answered by 2+ of the site's own pages, from `["query","page"]`
 *  rows. Pages with a negligible share of the query are ignored so one stray
 *  impression does not flag a query. Sorted by total impressions. */
export function buildCannibalizationRows(
  rows: GscSearchAnalyticsRow[],
  limit: number = CANNIBALIZATION_ROW_LIMIT,
): CannibalizationRow[] {
  const byQuery = new Map<string, CannibalizationPage[]>();
  for (const row of rows) {
    const query = row.keys?.[0];
    const page = row.keys?.[1];
    if (!query || !page) continue;
    const pages = byQuery.get(query) ?? [];
    pages.push({
      page,
      clicks: row.clicks,
      impressions: row.impressions,
      position: row.position,
    });
    byQuery.set(query, pages);
  }

  const result: CannibalizationRow[] = [];
  for (const [query, pages] of byQuery) {
    const totalImpressions = pages.reduce((sum, p) => sum + p.impressions, 0);
    if (totalImpressions < CANNIBALIZATION_MIN_QUERY_IMPRESSIONS) continue;
    const competing = pages.filter(
      (p) =>
        p.impressions >= CANNIBALIZATION_MIN_PAGE_IMPRESSIONS &&
        p.impressions / totalImpressions >= CANNIBALIZATION_MIN_PAGE_SHARE,
    );
    if (competing.length < 2) continue;
    result.push({
      query,
      totalImpressions,
      totalClicks: pages.reduce((sum, p) => sum + p.clicks, 0),
      pages: sort(competing, (a, b) => b.impressions - a.impressions).slice(
        0,
        CANNIBALIZATION_MAX_PAGES_PER_QUERY,
      ),
    });
  }
  return sort(result, (a, b) => b.totalImpressions - a.totalImpressions).slice(
    0,
    limit,
  );
}

type DecliningPageRow = {
  page: string;
  clicks: number;
  prevClicks: number;
  /** clicks - prevClicks (negative). */
  clicksDelta: number;
  /** Fractional change vs the previous period (-0.4 = down 40%). */
  clicksChange: number;
  impressions: number;
  prevImpressions: number;
  /** 0 when the page had no impressions this period. */
  position: number;
  prevPosition: number;
};

// A page "declines" when it lost a meaningful number of clicks AND a
// meaningful share of what it had, so tiny pages and noise stay out.
const DECLINE_MIN_CLICKS_LOST = 5;
const DECLINE_MIN_FRACTION_LOST = 0.2;
const DECLINE_ROW_LIMIT = 100;

/** Pages whose clicks fell versus the previous equal-length period, from
 *  single-dimension `["page"]` rows for each period. Pages that vanished from
 *  the current period count as a drop to zero. Biggest absolute loss first. */
export function buildDecliningPages(
  currentRows: GscSearchAnalyticsRow[],
  previousRows: GscSearchAnalyticsRow[],
  limit: number = DECLINE_ROW_LIMIT,
): DecliningPageRow[] {
  const current = new Map<string, GscSearchAnalyticsRow>();
  for (const row of currentRows) {
    const key = row.keys?.[0];
    if (key) current.set(key, row);
  }
  const result: DecliningPageRow[] = [];
  for (const prev of previousRows) {
    const page = prev.keys?.[0];
    if (!page || prev.clicks <= 0) continue;
    const now = current.get(page);
    const clicks = now?.clicks ?? 0;
    const lost = prev.clicks - clicks;
    if (lost < DECLINE_MIN_CLICKS_LOST) continue;
    if (lost / prev.clicks < DECLINE_MIN_FRACTION_LOST) continue;
    result.push({
      page,
      clicks,
      prevClicks: prev.clicks,
      clicksDelta: -lost,
      clicksChange: -lost / prev.clicks,
      impressions: now?.impressions ?? 0,
      prevImpressions: prev.impressions,
      position: now?.position ?? 0,
      prevPosition: prev.position,
    });
  }
  return sort(result, (a, b) => a.clicksDelta - b.clicksDelta).slice(0, limit);
}
