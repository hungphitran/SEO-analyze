import { useQuery } from "@tanstack/react-query";
import { QueryError } from "@/client/components/QueryState";
import { SkeletonTableRows } from "@/client/components/SkeletonPresets";
import { ExternalUrlCell } from "@/client/components/table/url";
import { Badge } from "@/client/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { GoogleConnectionCard } from "@/client/features/integrations/GoogleConnectionCard";
import {
  formatCount,
  formatCtr,
  formatPosition,
} from "@/client/features/search-performance/SearchPerformanceColumns";
import {
  getGa4MeasurementHealth,
  getGa4SearchOpportunities,
} from "@/serverFunctions/ga4";
import { formatUiNumber, t, type MessageKey } from "@/shared/i18n";

const HEALTH_ISSUE_KEYS: Record<string, MessageKey> = {
  no_web_stream: "gscOpportunities.healthIssueNoWebStream",
  enhanced_measurement_disabled: "gscOpportunities.healthIssueEnhancedDisabled",
  site_search_measurement_disabled:
    "gscOpportunities.healthIssueSiteSearchDisabled",
  no_key_events_configured: "gscOpportunities.healthIssueNoKeyEvents",
};

function formatHealthIssue(code: string): string {
  const key = HEALTH_ISSUE_KEYS[code];
  return key ? t(key) : code;
}

/**
 * Joins GSC striking-distance landing pages (positions 4-20) with GA4 organic
 * sessions, engagement and key events, plus GA4 measurement health.
 */
export function SearchOpportunitiesTab({ projectId }: { projectId: string }) {
  const opportunitiesQuery = useQuery({
    queryKey: ["ga4SearchOpportunities", projectId],
    queryFn: () => getGa4SearchOpportunities({ data: { projectId } }),
    staleTime: 5 * 60_000,
  });

  const healthQuery = useQuery({
    queryKey: ["ga4MeasurementHealth", projectId],
    queryFn: () => getGa4MeasurementHealth({ data: { projectId } }),
    enabled: opportunitiesQuery.data?.connected === true,
    staleTime: 5 * 60_000,
  });

  if (opportunitiesQuery.isPending) {
    return <SkeletonTableRows className="p-4" />;
  }

  if (opportunitiesQuery.isError || !opportunitiesQuery.data) {
    return (
      <div className="p-4">
        <QueryError
          error={opportunitiesQuery.error}
          fallback={t("gscOpportunities.loadFailed")}
          onRetry={() => void opportunitiesQuery.refetch()}
          isRetrying={opportunitiesQuery.isFetching}
        />
      </div>
    );
  }

  if (!opportunitiesQuery.data.connected) {
    return (
      <div className="max-w-2xl p-4">
        <GoogleConnectionCard
          provider={opportunitiesQuery.data.missing === "gsc" ? "gsc" : "ga4"}
          projectId={projectId}
        />
      </div>
    );
  }

  const { rows, coverage, totalCandidateRows, request } =
    opportunitiesQuery.data;
  const health = healthQuery.data?.connected ? healthQuery.data : null;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground">
          {t("gscOpportunities.coverageSummary", {
            matched: coverage.matchedRows,
            total: totalCandidateRows,
            start: request.dateRange.startDate,
            end: request.dateRange.endDate,
          })}
        </p>
        {health ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={health.summary.issueCount === 0 ? "success" : "warning"}
            >
              {health.summary.issueCount === 0
                ? t("gscOpportunities.healthOk")
                : t("gscOpportunities.healthIssues", {
                    count: health.summary.issueCount,
                  })}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {t("gscOpportunities.healthDetails", {
                streams: health.summary.webStreamCount,
                events: health.summary.keyEventCount,
              })}
            </span>
          </div>
        ) : null}
      </div>

      {health && health.issues.length > 0 ? (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {t("gscOpportunities.healthChecksLabel")}{" "}
          </span>
          {health.issues.map(formatHealthIssue).join(" · ")}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="space-y-1 p-6 text-sm" role="status">
          <p className="font-medium">{t("gscOpportunities.emptyTitle")}</p>
          <p className="text-muted-foreground">
            {t("gscOpportunities.emptyDesc")}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("gscInsights.colPage")}</TableHead>
                <TableHead className="text-right">
                  {t("gscOpportunities.colScore")}
                </TableHead>
                <TableHead className="text-right">
                  {t("gscInsights.colPosition")}
                </TableHead>
                <TableHead className="text-right">
                  {t("gscInsights.colImpressions")}
                </TableHead>
                <TableHead className="text-right">
                  {t("gscInsights.colClicks")}
                </TableHead>
                <TableHead className="text-right">
                  {t("dashboard.sessions")}
                </TableHead>
                <TableHead className="text-right">
                  {t("dashboard.engagementRate")}
                </TableHead>
                <TableHead className="text-right">
                  {t("dashboard.keyEvents")}
                </TableHead>
                <TableHead className="text-right">
                  {t("gscOpportunities.colRevenue")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.page}>
                  <TableCell className="max-w-sm">
                    <ExternalUrlCell value={row.page} label={row.page} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {row.score === null ? "—" : row.score}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPosition(row.position)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(row.impressions)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(row.clicks)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.ga4 ? formatUiNumber(row.ga4.sessions) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.ga4 ? formatCtr(row.ga4.engagementRate) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.ga4 ? formatUiNumber(row.ga4.keyEvents) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.ga4?.purchaseRevenue != null
                      ? formatUiNumber(row.ga4.purchaseRevenue)
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
