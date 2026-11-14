import { useState } from "react";
import { cn } from "cn";
import {
  SCORE_TEXT_CLASS,
  SeverityBadge,
  scoreTone,
} from "@/client/features/audit/shared";
import { PagespeedFieldDataView } from "@/client/features/pagespeed/PagespeedFieldDataView";
import {
  formatBytes,
  formatMs,
} from "@/client/features/lighthouse/issues/format";
import { Button } from "@/client/components/ui/button";
import { t, type MessageKey } from "@/shared/i18n";
import {
  readPagespeedSnapshot,
  type PagespeedSnapshotDetail,
} from "@/shared/pagespeed-detail";

type Strategy = "mobile" | "desktop";

const SCORE_LABELS: {
  key: keyof PagespeedSnapshotDetail["scores"];
  label: MessageKey;
}[] = [
  { key: "performance", label: "audit.performance" },
  { key: "accessibility", label: "audit.accessibility" },
  { key: "best-practices", label: "audit.bestPractices" },
  { key: "seo", label: "audit.seo" },
];

const CATEGORY_LABELS: Record<
  PagespeedSnapshotDetail["issues"][number]["category"],
  MessageKey
> = {
  performance: "audit.performance",
  accessibility: "audit.accessibility",
  "best-practices": "audit.bestPractices",
  seo: "audit.seo",
};

function metricRows(metrics: PagespeedSnapshotDetail["metrics"]) {
  return [
    ["FCP", metrics.firstContentfulPaint],
    ["LCP", metrics.largestContentfulPaint],
    ["TBT", metrics.totalBlockingTime],
    ["CLS", metrics.cumulativeLayoutShift],
    ["SI", metrics.speedIndex],
    ["TTI", metrics.timeToInteractive],
    ["INP", metrics.interactionToNextPaint],
    ["TTFB", metrics.serverResponseTime],
  ] as const;
}

function Savings({
  issue,
}: {
  issue: PagespeedSnapshotDetail["issues"][number];
}) {
  const parts = [
    issue.impactMs ? formatMs(issue.impactMs) : null,
    issue.impactBytes ? formatBytes(issue.impactBytes) : null,
  ].filter((part): part is string => part != null);
  if (parts.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span className="tabular-nums">{parts.join(" / ")}</span>;
}

function IssueList({ detail }: { detail: PagespeedSnapshotDetail }) {
  if (detail.issues.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("psi.noIssues")}</p>;
  }
  // Biggest estimated saving first; audits without a saving follow by severity.
  // oxlint-disable-next-line eslint-plugin-unicorn/no-array-sort -- sorting a local copy; the client lib target predates toSorted
  const ordered = [...detail.issues].sort(
    (a, b) =>
      (b.impactMs ?? 0) - (a.impactMs ?? 0) ||
      (b.impactBytes ?? 0) - (a.impactBytes ?? 0),
  );
  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {ordered.map((issue) => (
          <li
            key={`${issue.category}-${issue.auditKey}`}
            className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border/60 pt-1.5"
          >
            <span className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={issue.severity}>
                {issue.severity}
              </SeverityBadge>
              <span>{issue.title}</span>
              {issue.displayValue ? (
                <span className="text-muted-foreground text-xs">
                  {issue.displayValue}
                </span>
              ) : null}
            </span>
            <span className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{t(CATEGORY_LABELS[issue.category])}</span>
              <span title={t("psi.savings")}>
                <Savings issue={issue} />
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-xs">
        {detail.issueCount > detail.issues.length
          ? t("psi.issuesTruncated", {
              shown: detail.issues.length,
              total: detail.issueCount,
            })
          : t("psi.issuesCount", { total: detail.issueCount })}
      </p>
    </div>
  );
}

function StrategyDetail({ detail }: { detail: PagespeedSnapshotDetail }) {
  const metrics = metricRows(detail.metrics).filter(
    ([, metric]) => metric.displayValue != null,
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SCORE_LABELS.map(({ key, label }) => {
          const score = detail.scores[key];
          const tone = scoreTone(score);
          return (
            <div
              key={key}
              className="rounded-lg border border-border px-3 py-2 text-center"
            >
              <div
                className={cn(
                  "font-bold text-2xl",
                  tone ? SCORE_TEXT_CLASS[tone] : "text-muted-foreground",
                )}
              >
                {score ?? "—"}
              </div>
              <div className="text-muted-foreground text-xs">{t(label)}</div>
            </div>
          );
        })}
      </div>

      <section className="space-y-2">
        <h4 className="font-medium text-sm">{t("psi.labTitle")}</h4>
        {metrics.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("psi.labNone")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
            {metrics.map(([label, metric]) => (
              <div key={label} className="flex justify-between gap-2">
                <span className="text-muted-foreground text-xs">{label}</span>
                <span className="font-medium tabular-nums">
                  {metric.displayValue}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <PagespeedFieldDataView data={detail.fieldData} />

      <section className="space-y-2">
        <h4 className="font-medium text-sm">{t("psi.issuesTitle")}</h4>
        <IssueList detail={detail} />
      </section>

      <p className="text-muted-foreground text-xs">
        {detail.lighthouseVersion
          ? t("psi.lighthouseVersion", { version: detail.lighthouseVersion })
          : null}
        {detail.fetchedAt
          ? ` · ${t("psi.fetchedAt", {
              time: new Date(detail.fetchedAt).toLocaleString("vi-VN"),
            })}`
          : null}
      </p>
    </div>
  );
}

/**
 * PageSpeed Insights result kept in the latest snapshot: both strategies,
 * with scores, lab metrics, real-user data and the failed audits.
 */
export function PagespeedPanel({ summary }: { summary: unknown }) {
  const [strategy, setStrategy] = useState<Strategy>("mobile");
  const view = readPagespeedSnapshot(summary);
  if (!view) return null;

  const detail = strategy === "mobile" ? view.mobile : view.desktop;
  const error = strategy === "mobile" ? view.mobileError : view.desktopError;

  return (
    <section className="space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{t("psi.title")}</h3>
        <div className="flex gap-1">
          {(["mobile", "desktop"] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={value === strategy ? "secondary" : "outline"}
              aria-pressed={value === strategy}
              onClick={() => setStrategy(value)}
            >
              {value === "mobile" ? t("common.mobile") : t("common.desktop")}
            </Button>
          ))}
        </div>
      </div>
      {view.url ? (
        <p className="break-all text-muted-foreground text-xs">{view.url}</p>
      ) : null}
      {detail ? (
        <StrategyDetail detail={detail} />
      ) : error ? (
        <p className="text-destructive text-sm">
          {t("psi.strategyError", { message: error })}
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">
          {t("psi.strategyMissing")}
        </p>
      )}
      {view.legacy ? (
        <p className="text-muted-foreground text-xs">{t("psi.legacy")}</p>
      ) : null}
    </section>
  );
}
