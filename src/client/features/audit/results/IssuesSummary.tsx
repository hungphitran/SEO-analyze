import { useMemo } from "react";
import { cn } from "cn";
import { getAuditIssueCopy } from "@/client/features/audit/issueLabels";
import {
  summarizeIssues,
  type IssueViewFilter,
} from "@/client/features/audit/results/pageInsights";
import type { AuditResultsData } from "@/client/features/audit/results/types";
import { SeverityBadge } from "@/client/features/audit/shared";
import type { IssueSeverity } from "@/shared/audit-issues";
import { t } from "@/shared/i18n";

const SEVERITIES: Array<{ severity: IssueSeverity; accent: string }> = [
  { severity: "critical", accent: "border-l-destructive/60" },
  { severity: "warning", accent: "border-l-warning/60" },
  { severity: "info", accent: "border-l-info/60" },
];

const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  critical: t("common.critical"),
  warning: t("common.warning"),
  info: t("common.info"),
};

/**
 * Counts per severity and the most frequent issue types. Every item jumps to
 * the Issues tab with the matching filter applied.
 */
export function IssuesSummary({
  issues,
  onSelect,
}: {
  issues: AuditResultsData["issues"];
  onSelect: (filter: IssueViewFilter) => void;
}) {
  const summary = useMemo(() => summarizeIssues(issues), [issues]);

  return (
    <section
      aria-label={t("auditDetail.summaryTitle")}
      className="space-y-3 rounded-xl border border-border bg-card p-4"
    >
      <h2 className="text-sm font-medium">{t("auditDetail.summaryTitle")}</h2>
      {summary.total === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("auditDetail.summaryNone")}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {SEVERITIES.map(({ severity, accent }) => (
              <button
                key={severity}
                type="button"
                title={t("auditDetail.summaryClick")}
                disabled={summary.counts[severity] === 0}
                onClick={() => onSelect({ severity, issueType: null })}
                className={cn(
                  "rounded-lg border border-border border-l-4 p-3 text-left transition-colors hover:bg-muted/50 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent",
                  accent,
                )}
              >
                <div className="text-2xl font-semibold tabular-nums">
                  {summary.counts[severity]}
                </div>
                <div className="text-xs text-muted-foreground">
                  {SEVERITY_LABEL[severity]}
                </div>
              </button>
            ))}
          </div>
          <div>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("auditDetail.summaryTop")}
            </h3>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {summary.top.map((item) => (
                <li key={item.issueType}>
                  <button
                    type="button"
                    title={t("auditDetail.summaryClick")}
                    onClick={() =>
                      onSelect({
                        severity: "all",
                        issueType: item.issueType,
                      })
                    }
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
                  >
                    <SeverityBadge severity={item.severity}>
                      {SEVERITY_LABEL[item.severity]}
                    </SeverityBadge>
                    <span className="min-w-0 flex-1 truncate">
                      {getAuditIssueCopy(item.issueType).title}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {t("auditDetail.summaryPages", {
                        count: item.pageCount,
                      })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
