import {
  SeoFactsRepository,
  type SeoDailyFactInsert,
} from "@/server/features/free-sources/repositories/SeoFactsRepository";
import { GscService } from "@/server/features/gsc/services/GscService";
import { BingWebmasterConnectionRepository } from "@/server/features/free-sources/repositories/BingWebmasterConnectionRepository";
import { openBingApiKey } from "@/server/features/free-sources/services/BingDetailsService";
import { getBingQueryStats } from "@/server/lib/free-sources/bing";
import { Ga4ConnectionRepository } from "@/server/features/ga4/repositories/Ga4ConnectionRepository";
import { Ga4ReportingService } from "@/server/features/ga4/services/Ga4ReportingService";
import { safeErrorMessage } from "@/server/lib/free-sources/redact";

export function normalizePageUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed === "(not set)") return null;
  try {
    const parsed = new URL(
      trimmed.includes("://") ? trimmed : `https://${trimmed}`,
    );
    let host = parsed.hostname.toLowerCase();
    const isDefaultPort =
      (parsed.protocol === "http:" && parsed.port === "80") ||
      (parsed.protocol === "https:" && parsed.port === "443");
    if (parsed.port && !isDefaultPort) host += `:${parsed.port}`;
    let path = parsed.pathname || "/";
    if (path.length > 1) path = path.replace(/\/+$/, "");
    return `${parsed.protocol}//${host}${path}${parsed.search}`;
  } catch {
    return null;
  }
}

export function buildFactGrainKey(parts: {
  propertyId: string;
  factDate: string;
  grainType: "site" | "page" | "query" | "query_page";
  query?: string | null;
  normalizedUrl?: string | null;
  country?: string | null;
  device?: string | null;
}): string {
  return [
    parts.propertyId,
    parts.factDate,
    parts.grainType,
    parts.query ?? "",
    parts.normalizedUrl ?? "",
    parts.country ?? "",
    parts.device ?? "",
  ].join("|");
}

export type AggregatedSeoMetrics = {
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  averagePosition: number | null;
  organicSessions: number | null;
  keyEvents: number | null;
};

/**
 * Aggregates facts of the SAME source and grain without inventing zeros for
 * missing observations or averaging averages when impression weights are absent.
 */
export function aggregateSameGrainFacts(
  rows: Array<{
    clicks: number | null;
    impressions: number | null;
    averagePosition: number | null;
    organicSessions: number | null;
    keyEvents: number | null;
  }>,
): AggregatedSeoMetrics {
  if (rows.length === 0) {
    return {
      clicks: null,
      impressions: null,
      ctr: null,
      averagePosition: null,
      organicSessions: null,
      keyEvents: null,
    };
  }

  let clicksSum = 0;
  let hasClicks = false;
  let impressionsSum = 0;
  let hasImpressions = false;
  let weightedPosSum = 0;
  let weightedPosImpr = 0;
  let sessionsSum = 0;
  let hasSessions = false;
  let keyEventsSum = 0;
  let hasKeyEvents = false;

  for (const row of rows) {
    if (row.clicks !== null) {
      clicksSum += row.clicks;
      hasClicks = true;
    }
    if (row.impressions !== null) {
      impressionsSum += row.impressions;
      hasImpressions = true;
      if (row.averagePosition !== null && row.impressions > 0) {
        weightedPosSum += row.averagePosition * row.impressions;
        weightedPosImpr += row.impressions;
      }
    }
    if (row.organicSessions !== null) {
      sessionsSum += row.organicSessions;
      hasSessions = true;
    }
    if (row.keyEvents !== null) {
      keyEventsSum += row.keyEvents;
      hasKeyEvents = true;
    }
  }

  const clicks = hasClicks ? clicksSum : null;
  const impressions = hasImpressions ? impressionsSum : null;
  const ctr =
    clicks !== null && impressions !== null && impressions > 0
      ? clicks / impressions
      : null;
  const averagePosition =
    weightedPosImpr > 0 ? weightedPosSum / weightedPosImpr : null;

  return {
    clicks,
    impressions,
    ctr,
    averagePosition,
    organicSessions: hasSessions ? sessionsSum : null,
    keyEvents: hasKeyEvents ? keyEventsSum : null,
  };
}

function defaultPeriodDates(): { startDate: string; endDate: string } {
  const end = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - 27 * 24 * 60 * 60 * 1000);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export async function syncOwnedSiteFacts(input: {
  projectId: string;
  organizationId: string;
  source: "gsc" | "bing_webmaster" | "ga4";
  startDate?: string;
  endDate?: string;
}) {
  const period =
    input.startDate && input.endDate
      ? { startDate: input.startDate, endDate: input.endDate }
      : defaultPeriodDates();
  const runId = crypto.randomUUID();
  await SeoFactsRepository.createSyncRun({
    id: runId,
    projectId: input.projectId,
    organizationId: input.organizationId,
    source: input.source,
    periodStart: period.startDate,
    periodEnd: period.endDate,
  });

  try {
    const facts: SeoDailyFactInsert[] = [];
    let completeness: "complete" | "partial" | "sampled" = "partial";
    let coverageInfo = "";

    if (input.source === "gsc") {
      const res = await GscService.getPerformance({
        projectId: input.projectId,
        dimensions: ["date", "query", "page"],
        startDate: period.startDate,
        endDate: period.endDate,
        rowLimit: 5000,
        startRow: 0,
        type: "web",
        dataState: "final",
      });
      for (const row of res.rows) {
        const factDate = row.keys?.[0] ?? period.endDate;
        const query = row.keys?.[1] ?? null;
        const pageUrl = row.keys?.[2] ?? null;
        const normalizedUrl = pageUrl ? normalizePageUrl(pageUrl) : null;
        const grainKey = buildFactGrainKey({
          propertyId: res.siteUrl,
          factDate,
          grainType: "query_page",
          query,
          normalizedUrl,
        });
        facts.push({
          id: crypto.randomUUID(),
          projectId: input.projectId,
          organizationId: input.organizationId,
          propertyId: res.siteUrl,
          source: "gsc",
          factDate,
          grainType: "query_page",
          grainKey,
          query,
          pageUrl,
          normalizedUrl,
          country: null,
          device: null,
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr ?? null,
          averagePosition: row.position ?? null,
          organicSessions: null,
          keyEvents: null,
          provenance: "GSC Search Analytics API (final, Pacific Time)",
          syncRunId: runId,
        });
      }
      completeness = res.rows.length >= 5000 ? "partial" : "complete";
      coverageInfo = `GSC ${res.rows.length} rows (${period.startDate}..${period.endDate})`;
    } else if (input.source === "bing_webmaster") {
      const conn = await BingWebmasterConnectionRepository.getByProjectId(
        input.projectId,
      );
      if (!conn) {
        throw new Error("Bing Webmaster is not connected for this project.");
      }
      const opened = await openBingApiKey(conn.encryptedApiKey);
      if (!opened.ok) {
        throw new Error(opened.message);
      }
      const summary = await getBingQueryStats({
        apiKey: opened.apiKey,
        siteUrl: conn.siteUrl,
        sinceMs: Date.parse(period.startDate),
        limit: 200,
      });
      for (const row of summary.queries) {
        const grainKey = buildFactGrainKey({
          propertyId: conn.siteUrl,
          factDate: period.endDate,
          grainType: "query",
          query: row.query,
        });
        facts.push({
          id: crypto.randomUUID(),
          projectId: input.projectId,
          organizationId: input.organizationId,
          propertyId: conn.siteUrl,
          source: "bing_webmaster",
          factDate: period.endDate,
          grainType: "query",
          grainKey,
          query: row.query,
          pageUrl: null,
          normalizedUrl: null,
          country: null,
          device: null,
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.impressions > 0 ? row.clicks / row.impressions : null,
          averagePosition: row.avgImpressionPosition ?? null,
          organicSessions: null,
          keyEvents: null,
          provenance: "Bing Webmaster JSON API (GetQueryStats)",
          syncRunId: runId,
        });
      }
      completeness = "partial";
      coverageInfo = `Bing ${summary.queries.length} top queries`;
    } else if (input.source === "ga4") {
      const conn = await Ga4ConnectionRepository.getByProjectId(input.projectId);
      if (!conn) {
        throw new Error("GA4 is not connected for this project.");
      }
      const report = await Ga4ReportingService.runReport({
        projectId: input.projectId,
        kind: "landing_pages",
        startDate: period.startDate,
        endDate: period.endDate,
        limit: 500,
        offset: 0,
        channel: "organic_search",
      });
      for (const row of report.rows) {
        const pageUrl =
          typeof row.landingPagePlusQueryString === "string"
            ? row.landingPagePlusQueryString
            : null;
        const normalizedUrl = pageUrl ? normalizePageUrl(pageUrl) : null;
        const sessions =
          typeof row.sessions === "number" ? row.sessions : null;
        const keyEvents =
          typeof row.keyEvents === "number" ? row.keyEvents : null;
        const grainKey = buildFactGrainKey({
          propertyId: conn.propertyId,
          factDate: period.endDate,
          grainType: "page",
          normalizedUrl: normalizedUrl ?? pageUrl,
        });
        facts.push({
          id: crypto.randomUUID(),
          projectId: input.projectId,
          organizationId: input.organizationId,
          propertyId: conn.propertyId,
          source: "ga4",
          factDate: period.endDate,
          grainType: "page",
          grainKey,
          query: null,
          pageUrl,
          normalizedUrl,
          country: null,
          device: null,
          clicks: null,
          impressions: null,
          ctr: null,
          averagePosition: null,
          organicSessions: sessions,
          keyEvents,
          provenance: "GA4 Data API (Organic Search landing pages)",
          syncRunId: runId,
        });
      }
      completeness = "partial";
      coverageInfo = `GA4 ${report.rows.length} organic landing pages`;
    }

    const rowCount = await SeoFactsRepository.upsertDailyFacts(facts);
    return await SeoFactsRepository.completeSyncRun({
      id: runId,
      projectId: input.projectId,
      rowCount,
      completeness,
      coverageInfo,
    });
  } catch (error) {
    await SeoFactsRepository.failSyncRun({
      id: runId,
      projectId: input.projectId,
      errorCode: "SYNC_FAILED",
      errorMessage: safeErrorMessage(error),
    });
    throw error;
  }
}
