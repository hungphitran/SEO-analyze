import { sort } from "remeda";
import { SeoFactsRepository } from "@/server/features/free-sources/repositories/SeoFactsRepository";
import {
  aggregateSameGrainFacts,
  type AggregatedSeoMetrics,
} from "@/server/features/free-sources/services/OwnedSiteAnalyticsService";
import {
  buildEvidenceEnvelope,
  type DataState,
  type EvidenceEnvelope,
} from "@/shared/evidence-envelope";

export type SeoOverviewResult = {
  projectId: string;
  periodStart: string;
  periodEnd: string;
  gsc: EvidenceEnvelope<AggregatedSeoMetrics>;
  bing: EvidenceEnvelope<AggregatedSeoMetrics>;
  ga4: EvidenceEnvelope<AggregatedSeoMetrics>;
  topPages: Array<{
    pageUrl: string;
    clicks: number;
    impressions: number;
    ctr: number | null;
    averagePosition: number | null;
  }>;
  topQueries: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number | null;
    averagePosition: number | null;
  }>;
  syncRuns: Awaited<ReturnType<typeof SeoFactsRepository.listSyncRuns>>;
};

function defaultPeriodDates(): { startDate: string; endDate: string } {
  const end = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - 27 * 24 * 60 * 60 * 1000);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export async function getSeoOverview(input: {
  projectId: string;
  startDate?: string;
  endDate?: string;
}): Promise<SeoOverviewResult> {
  const period =
    input.startDate && input.endDate
      ? { startDate: input.startDate, endDate: input.endDate }
      : defaultPeriodDates();

  const [facts, syncRuns] = await Promise.all([
    SeoFactsRepository.listDailyFacts({
      projectId: input.projectId,
      startDate: period.startDate,
      endDate: period.endDate,
      limit: 5000,
    }),
    SeoFactsRepository.listSyncRuns(input.projectId, undefined, 15),
  ]);

  const gscRows = facts.filter((r) => r.source === "gsc");
  const bingRows = facts.filter((r) => r.source === "bing_webmaster");
  const ga4Rows = facts.filter((r) => r.source === "ga4");

  const resolveState = (
    rowsCount: number,
    src: "gsc" | "bing_webmaster" | "ga4",
  ): DataState => {
    const latestRun = syncRuns.find((r) => r.source === src);
    if (rowsCount === 0) {
      return latestRun?.state === "failed"
        ? "provider_error"
        : "insufficient_data";
    }
    if (latestRun?.state === "failed") return "stale";
    return "partial";
  };

  type MetricSlice = {
    clicks: number | null;
    impressions: number | null;
    averagePosition: number | null;
    organicSessions: number | null;
    keyEvents: number | null;
  };
  const pageMap = new Map<string, MetricSlice[]>();
  const queryMap = new Map<string, MetricSlice[]>();

  for (const row of gscRows) {
    if (row.pageUrl) {
      const list = pageMap.get(row.pageUrl) ?? [];
      list.push(row);
      pageMap.set(row.pageUrl, list);
    }
    if (row.query) {
      const list = queryMap.get(row.query) ?? [];
      list.push(row);
      queryMap.set(row.query, list);
    }
  }

  const topPages = sort(
    Array.from(pageMap.entries()).map(([pageUrl, rows]) => {
      const agg = aggregateSameGrainFacts(rows);
      return {
        pageUrl,
        clicks: agg.clicks ?? 0,
        impressions: agg.impressions ?? 0,
        ctr: agg.ctr,
        averagePosition: agg.averagePosition,
      };
    }),
    (a, b) => b.clicks - a.clicks,
  ).slice(0, 50);

  const topQueries = sort(
    Array.from(queryMap.entries()).map(([query, rows]) => {
      const agg = aggregateSameGrainFacts(rows);
      return {
        query,
        clicks: agg.clicks ?? 0,
        impressions: agg.impressions ?? 0,
        ctr: agg.ctr,
        averagePosition: agg.averagePosition,
      };
    }),
    (a, b) => b.impressions - a.impressions,
  ).slice(0, 50);

  return {
    projectId: input.projectId,
    periodStart: period.startDate,
    periodEnd: period.endDate,
    gsc: buildEvidenceEnvelope({
      source: "gsc",
      projectId: input.projectId,
      state: resolveState(gscRows.length, "gsc"),
      completeness: gscRows.length > 0 ? "partial" : "unknown",
      periodStart: period.startDate,
      periodEnd: period.endDate,
      granularity: "day",
      attribution: "Google Search Console (final)",
      payload: gscRows.length > 0 ? aggregateSameGrainFacts(gscRows) : null,
    }),
    bing: buildEvidenceEnvelope({
      source: "bing_webmaster",
      projectId: input.projectId,
      state: resolveState(bingRows.length, "bing_webmaster"),
      completeness: bingRows.length > 0 ? "partial" : "unknown",
      periodStart: period.startDate,
      periodEnd: period.endDate,
      granularity: "day",
      attribution: "Bing Webmaster JSON API",
      payload: bingRows.length > 0 ? aggregateSameGrainFacts(bingRows) : null,
    }),
    ga4: buildEvidenceEnvelope({
      source: "ga4",
      projectId: input.projectId,
      state: resolveState(ga4Rows.length, "ga4"),
      completeness: ga4Rows.length > 0 ? "partial" : "unknown",
      periodStart: period.startDate,
      periodEnd: period.endDate,
      granularity: "day",
      attribution: "GA4 Organic Search",
      payload: ga4Rows.length > 0 ? aggregateSameGrainFacts(ga4Rows) : null,
    }),
    topPages,
    topQueries,
    syncRuns,
  };
}
