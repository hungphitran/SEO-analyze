import { GscNotConnectedError } from "@/server/lib/gscErrors";
import { GscService } from "@/server/features/gsc/services/GscService";
import { BingWebmasterConnectionRepository } from "@/server/features/free-sources/repositories/BingWebmasterConnectionRepository";
import { OwnedSiteSnapshotRepository } from "@/server/features/free-sources/repositories/OwnedSiteSnapshotRepository";
import { AppError } from "@/server/lib/errors";
import {
  bingRefreshMessage,
  getBingQueryStats,
  type BingQuerySummary,
  type BingVerifiedSite,
} from "@/server/lib/free-sources/bing";
import { isFreeSourcesOnly } from "@/server/lib/free-sources/mode";
import {
  runPagespeedAudit,
  type ParsedPagespeedScores,
} from "@/server/lib/free-sources/pagespeed";
import { projectWebsiteUrlFromDomain } from "@/server/lib/free-sources/project-url";
import { safeErrorMessage } from "@/server/lib/free-sources/redact";
import {
  hasFreeSourcesEncryptionKey,
  openSecret,
} from "@/server/lib/free-sources/secret-box";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import {
  getCruxApiKey,
  getOpenPageRankApiKey,
} from "@/server/features/free-sources/services/RealUserSignalsService";
import { hasGoogleOAuthConfig } from "@/server/features/google/oauth-config";
import {
  FREE_SOURCE_LABELS,
  FREE_SOURCES_LIMITATIONS,
  type FreeOwnedSiteSource,
  type FreeSourceSnapshotView,
  type FreeSourcesStatus,
  type JsonValue,
  type OwnedSiteSnapshotStatus,
  type SnapshotSummary,
} from "@/shared/free-sources-mode";

const QUERY_LIMIT = 25;
const TWENTY_EIGHT_DAYS_MS = 28 * 24 * 60 * 60 * 1000;

export type { FreeSourceSnapshotView, FreeSourcesStatus };

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (typeof value === "object") {
    return Object.values(value).every(isJsonValue);
  }
  return false;
}

function isSummary(value: unknown): value is SnapshotSummary {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    isJsonValue(value)
  );
}

function parseSummary(raw: string | null): SnapshotSummary | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isSummary(value) ? value : null;
  } catch {
    return null;
  }
}

function toSnapshotView(
  source: FreeOwnedSiteSource,
  row: {
    status: string;
    message: string | null;
    fetchedAt: string;
    summaryJson: string | null;
  } | null,
): FreeSourceSnapshotView | null {
  if (!row) return null;
  const status: OwnedSiteSnapshotStatus =
    row.status === "ok" || row.status === "skipped" || row.status === "error"
      ? row.status
      : "error";
  return {
    source,
    label: FREE_SOURCE_LABELS[source],
    status,
    message: row.message,
    fetchedAt: row.fetchedAt,
    summary: parseSummary(row.summaryJson),
  };
}

async function recordSnapshot(input: {
  projectId: string;
  organizationId: string;
  source: FreeOwnedSiteSource;
  status: OwnedSiteSnapshotStatus;
  message: string | null;
  summary: SnapshotSummary | null;
}) {
  const fetchedAt = new Date().toISOString();
  const row = await OwnedSiteSnapshotRepository.upsert({
    projectId: input.projectId,
    organizationId: input.organizationId,
    source: input.source,
    status: input.status,
    message: input.message,
    summaryJson: input.summary ? JSON.stringify(input.summary) : null,
    fetchedAt,
  });
  return toSnapshotView(input.source, row)!;
}

export async function getFreeSourcesStatus(input: {
  projectId: string;
}): Promise<FreeSourcesStatus> {
  const [
    gsc,
    bing,
    snapshots,
    pagespeedKey,
    canStoreKey,
    oauth,
    freeOnly,
    cruxKey,
    oprKey,
  ] = await Promise.all([
    GscService.getConnection(input.projectId),
    BingWebmasterConnectionRepository.getByProjectId(input.projectId),
    OwnedSiteSnapshotRepository.listByProjectId(input.projectId),
    getOptionalEnvValue("PAGESPEED_API_KEY"),
    hasFreeSourcesEncryptionKey(),
    hasGoogleOAuthConfig(),
    isFreeSourcesOnly(),
    getCruxApiKey(),
    getOpenPageRankApiKey(),
  ]);

  const snapshotBySource = new Map(
    snapshots.map((row) => [row.source, row] as const),
  );

  return {
    freeSourcesOnly: freeOnly,
    limitations: FREE_SOURCES_LIMITATIONS,
    googleSearchConsole: {
      configured: oauth,
      connected: Boolean(gsc),
      siteUrl: gsc?.siteUrl ?? null,
    },
    pagespeed: {
      configured: Boolean(pagespeedKey?.trim()),
    },
    crux: { configured: Boolean(cruxKey) },
    openPageRank: { configured: Boolean(oprKey) },
    bing: {
      connected: Boolean(bing),
      siteUrl: bing?.siteUrl ?? null,
      canStoreKey,
    },
    snapshots: (["gsc", "pagespeed", "bing"] as const)
      .map((source) =>
        toSnapshotView(source, snapshotBySource.get(source) ?? null),
      )
      .filter((row): row is FreeSourceSnapshotView => row != null),
  };
}

async function refreshGsc(input: {
  projectId: string;
  organizationId: string;
}): Promise<FreeSourceSnapshotView> {
  try {
    const result = await GscService.getPerformance({
      projectId: input.projectId,
      dimensions: ["query"],
      dateRange: "last_28_days",
      rowLimit: QUERY_LIMIT,
    });
    const rows = result.rows.slice(0, QUERY_LIMIT).map((row) => ({
      query: row.keys?.[0] ?? "",
      clicks: row.clicks,
      impressions: row.impressions,
      position: row.position ?? null,
    }));
    return recordSnapshot({
      ...input,
      source: "gsc",
      status: "ok",
      message: `Search Console returned ${rows.length} queries for the last 28 days.`,
      summary: {
        siteUrl: result.siteUrl,
        queryCount: rows.length,
        totalClicks: rows.reduce((sum, row) => sum + row.clicks, 0),
        totalImpressions: rows.reduce((sum, row) => sum + row.impressions, 0),
        queries: rows,
      },
    });
  } catch (error) {
    if (error instanceof GscNotConnectedError) {
      return recordSnapshot({
        ...input,
        source: "gsc",
        status: "skipped",
        message:
          "Connect Google Search Console for this project to load query data for a verified property.",
        summary: null,
      });
    }
    return recordSnapshot({
      ...input,
      source: "gsc",
      status: "error",
      message: `Search Console could not be refreshed. ${safeErrorMessage(error)}`,
      summary: null,
    });
  }
}

async function refreshPagespeed(input: {
  projectId: string;
  organizationId: string;
  domain: string | null | undefined;
}): Promise<FreeSourceSnapshotView> {
  const url = projectWebsiteUrlFromDomain(input.domain);
  if (!url) {
    return recordSnapshot({
      ...input,
      source: "pagespeed",
      status: "skipped",
      message:
        "This project has no website domain yet, so PageSpeed Insights was not called. Set the project website first.",
      summary: null,
    });
  }
  const apiKey = (await getOptionalEnvValue("PAGESPEED_API_KEY"))?.trim();
  if (!apiKey) {
    return recordSnapshot({
      ...input,
      source: "pagespeed",
      status: "skipped",
      message:
        "PageSpeed Insights is not configured. Set PAGESPEED_API_KEY on the server, then refresh again.",
      summary: null,
    });
  }
  try {
    const mobile = await runPagespeedAudit({
      url,
      strategy: "mobile",
      apiKey,
    });
    const summary: { url: string; mobile: ParsedPagespeedScores } = {
      url,
      mobile,
    };
    return recordSnapshot({
      ...input,
      source: "pagespeed",
      status: "ok",
      message: `PageSpeed Insights (mobile) scored performance ${mobile.performanceScore ?? "n/a"} for ${url}.`,
      summary,
    });
  } catch (error) {
    return recordSnapshot({
      ...input,
      source: "pagespeed",
      status: "error",
      message: safeErrorMessage(error, apiKey),
      summary: { url },
    });
  }
}

async function refreshBing(input: {
  projectId: string;
  organizationId: string;
}): Promise<FreeSourceSnapshotView> {
  const connection = await BingWebmasterConnectionRepository.getByProjectId(
    input.projectId,
  );
  if (!connection) {
    return recordSnapshot({
      ...input,
      source: "bing",
      status: "skipped",
      message:
        "Connect Bing Webmaster for a verified site to load query stats.",
      summary: null,
    });
  }

  let apiKey: string;
  try {
    apiKey = await openSecret(connection.encryptedApiKey);
  } catch (error) {
    return recordSnapshot({
      ...input,
      source: "bing",
      status: "error",
      message:
        error instanceof AppError && error.code === "AUTH_CONFIG_MISSING"
          ? error.message
          : "The stored Bing Webmaster key could not be decrypted. Disconnect and save the key again after checking BETTER_AUTH_SECRET.",
      summary: { siteUrl: connection.siteUrl },
    });
  }

  try {
    const sinceMs = Date.now() - TWENTY_EIGHT_DAYS_MS;
    const stats: BingQuerySummary = await getBingQueryStats({
      apiKey,
      siteUrl: connection.siteUrl,
      sinceMs,
      limit: QUERY_LIMIT,
    });
    return recordSnapshot({
      ...input,
      source: "bing",
      status: "ok",
      message: `Bing Webmaster returned ${stats.queryCount} queries for ${connection.siteUrl}.`,
      summary: stats,
    });
  } catch (error) {
    return recordSnapshot({
      ...input,
      source: "bing",
      status: "error",
      message: bingRefreshMessage(error, apiKey),
      summary: { siteUrl: connection.siteUrl },
    });
  }
}

export async function refreshOwnedSiteSources(input: {
  projectId: string;
  organizationId: string;
  domain: string | null | undefined;
}): Promise<{ snapshots: FreeSourceSnapshotView[] }> {
  // Run sources independently so one failure cannot block the others.
  // This path must not import or call DataForSEO.
  const snapshots = await Promise.all([
    refreshGsc(input),
    refreshPagespeed(input),
    refreshBing(input),
  ]);
  return { snapshots };
}

export type { BingVerifiedSite };
export {
  disconnectBing,
  listBingSitesForKey,
  saveBingConnection,
} from "./BingConnectionService";
