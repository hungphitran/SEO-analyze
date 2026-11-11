import { GoogleSearchConsoleLogo } from "@/client/features/integrations/GoogleProductLogos";
import { startAudit } from "@/serverFunctions/audit";
import { QueryError } from "@/client/components/QueryState";
import { LoaderCircle, ScanSearch } from "lucide-react";
import { CardShell } from "@/client/components/CardShell";
import { Progress } from "@/client/components/ui/progress";
import { Button } from "@/client/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { GoogleConnectionCard } from "@/client/features/integrations/GoogleConnectionCard";
import { SeverityBadge } from "@/client/features/audit/shared";
import { getAuditIssueTitle } from "@/client/features/audit/issueLabels";

import {
  formatCtr,
  formatPosition,
} from "@/client/features/search-performance/SearchPerformanceColumns";
import { getSearchPerformanceReport } from "@/serverFunctions/searchPerformance";
import {
  formatDay,
  moreDetailsClass,
  MetricsTableSkeleton,
} from "@/client/features/dashboard/cardParts";
import { percentChange } from "@/client/components/MetricsTable";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import type { DashboardAuditSummary } from "@/server/features/dashboard/services/DashboardService";
import { formatUiNumber, t } from "@/shared/i18n";

// Plain string-keyed view of the registry: issue types from the DB are not
// statically guaranteed to be registry keys.
export function GscCard({
  projectId,
  connected,
  siteUrl,
}: {
  projectId: string;
  connected: boolean;
  siteUrl: string | null;
}) {
  const reportQuery = useQuery({
    queryKey: ["dashboardGscReport", projectId, siteUrl],
    queryFn: () =>
      getSearchPerformanceReport({
        data: { projectId, dateRange: "last_28_days" },
      }),
    enabled: connected,
    staleTime: 10 * 60_000,
  });
  const report = reportQuery.data;

  // Not connected (or a dead grant discovered by the report call): the
  // connection card sells and runs the whole flow itself.
  if (!connected || (report && !report.connected)) {
    return (
      <div id="connect-gsc">
        <GoogleConnectionCard provider="gsc" projectId={projectId} prominent />
      </div>
    );
  }

  return (
    <CardShell
      title={t("dashboard.gscPerformance")}
      icon={<GoogleSearchConsoleLogo className="size-5" />}
      action={
        <Link
          to="/p/$projectId/search-performance"
          params={{ projectId }}
          className={moreDetailsClass}
        >
          {t("dashboard.viewGscInsights")}
        </Link>
      }
    >
      <p className="mb-4 text-sm font-medium text-muted-foreground">
        {t("dashboard.last28Days")}
      </p>
      {reportQuery.isError ? (
        <p className="text-sm text-muted-foreground">
          {t("dashboard.couldNotLoadGsc")}
        </p>
      ) : !report ? (
        <MetricsTableSkeleton />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.metric")}</TableHead>
              <TableHead className="text-right">{t("common.value")}</TableHead>
              <TableHead className="text-right">{t("common.change")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              {
                label: t("dashboard.clicks"),
                value: formatUiNumber(report.totals.clicks),
                change: percentChange(
                  report.totals.clicks,
                  report.prevTotals.clicks,
                ),
              },
              {
                label: t("dashboard.impressions"),
                value: formatUiNumber(report.totals.impressions),
                change: percentChange(
                  report.totals.impressions,
                  report.prevTotals.impressions,
                ),
              },
              {
                label: t("dashboard.ctr"),
                value: formatCtr(report.totals.ctr),
                change: null,
              },
              {
                label: t("dashboard.averagePosition"),
                value: formatPosition(report.totals.position),
                change: null,
              },
            ].map((metric) => (
              <TableRow key={metric.label}>
                <TableCell>{metric.label}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {metric.value}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${metric.change === null || metric.change === 0 ? "text-muted-foreground" : metric.change > 0 ? "text-success" : "text-destructive"}`}
                >
                  {metric.change === null
                    ? "—"
                    : `${metric.change > 0 ? "+" : ""}${metric.change}%`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardShell>
  );
}

export function AuditHealthCard({
  projectId,
  audit,
  domain,
}: {
  projectId: string;
  audit: DashboardAuditSummary | null;
  domain: string | null;
}) {
  const queryClient = useQueryClient();
  const scan = useMutation({
    mutationFn: () =>
      startAudit({
        data: {
          projectId,
          startUrl: `https://${domain}`,
          maxPages: 50,
          renderJavaScript: true,
        },
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ["dashboardOverview", projectId],
      }),
    meta: { errorToast: false },
  });
  if (!audit)
    return (
      <CardShell title={t("dashboard.siteHealth")}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
          <ScanSearch className="size-7 text-muted-foreground" />
          <h3 className="font-medium">{t("dashboard.findWhatsHoldingBack")}</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
{t("dashboard.scanPitch", { max: 50 })}
          </p>
          {domain ? (
            <Button disabled={scan.isPending} onClick={() => scan.mutate()}>
              {scan.isPending ? t("dashboard.startingScan") : t("dashboard.scanMyWebsite")}
            </Button>
          ) : (
            <Button
              nativeButton={false}
              render={
                <Link to="/p/$projectId/settings" params={{ projectId }} />
              }
            >
              {t("common.addYourWebsite")}
            </Button>
          )}
          {scan.isError && (
            <QueryError
              error={scan.error}
              fallback={t("dashboard.couldNotStartScan")}
            />
          )}
        </div>
      </CardShell>
    );

  if (audit.status === "running") {
    const isLighthouse = audit.currentPhase === "lighthouse";
    const isFinalizing = audit.currentPhase === "finalizing";
    const checked = isLighthouse
      ? audit.lighthouseCompleted + audit.lighthouseFailed
      : audit.pagesCrawled;
    const total = isLighthouse ? audit.lighthouseTotal : audit.pagesTotal;
    // A running crawl has at most a partial issue list, and an empty one is
    // not the same as a healthy site, so show progress instead.
    return (
      <CardShell
        title={t("dashboard.siteHealth")}
        action={
          <Link
            to="/p/$projectId/audit"
            params={{ projectId }}
            search={{ auditId: audit.id }}
            className={moreDetailsClass}
          >
            {t("dashboard.viewProgress")}
          </Link>
        }
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
          <LoaderCircle className="size-7 animate-spin text-muted-foreground" />
          <h3 className="font-medium">
            {isLighthouse
              ? t("dashboard.runningLighthouse")
              : isFinalizing
                ? t("dashboard.preparingResults")
                : audit.currentPhase === "discovery"
                  ? t("dashboard.findingPagesToScan")
                  : t("dashboard.scanningYourWebsite")}
          </h3>
          {!isFinalizing && (
            <Progress
              className="w-full max-w-xs"
              value={checked}
              max={total || 1}
              aria-label={isLighthouse ? t("dashboard.lighthouseChecks") : t("dashboard.pagesCrawled")}
            />
          )}
          <p className="text-sm text-muted-foreground tabular-nums">
            {isLighthouse
              ? audit.lighthouseFailed > 0
                ? t("dashboard.checksFailed", {
                    checked,
                    total,
                    failed: audit.lighthouseFailed,
                  })
                : t("dashboard.checksProgress", { checked, total })
              : isFinalizing
                ? t("dashboard.pagesCrawledFinishing", {
                    count: formatUiNumber(audit.pagesCrawled),
                  })
                : t("dashboard.pagesCrawledProgress", { checked, total })}
          </p>
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell
      title={t("dashboard.siteHealth")}
      action={
        <Link
          to="/p/$projectId/audit"
          params={{ projectId }}
          search={{ auditId: audit.id, tab: "issues" }}
          className={moreDetailsClass}
        >
          {t("dashboard.reviewIssues")}
        </Link>
      }
    >
      {audit.status === "failed" && (
        <p className="mb-4 text-sm text-destructive">
          {t("dashboard.scanDidNotFinish")}
        </p>
      )}
      {audit.status === "completed" && (
        <p className="mb-4 text-sm text-muted-foreground">
          {t("dashboard.pagesCheckedOn", { count: formatUiNumber(audit.pagesCrawled), date: formatDay(audit.startedAt) })}
        </p>
      )}
      {audit.topIssues.length === 0 ? (
        audit.status === "completed" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="size-4 text-success" />
            {t("dashboard.noIssuesFound")}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("dashboard.runAuditAgain")}
          </p>
        )
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.issue")}</TableHead>
              <TableHead>{t("common.severity")}</TableHead>
              <TableHead className="text-right">{t("dashboard.pagesAffected")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {audit.topIssues.map((issue) => (
              <TableRow key={issue.issueType}>
                <TableCell>
                  {getAuditIssueTitle(issue.issueType)}
                </TableCell>
                <TableCell>
                  <SeverityBadge severity={issue.severity}>
                    {issue.severity === "critical"
                      ? t("common.critical")
                      : issue.severity === "warning"
                        ? t("common.warning")
                        : t("common.info")}
                  </SeverityBadge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {issue.count}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardShell>
  );
}
