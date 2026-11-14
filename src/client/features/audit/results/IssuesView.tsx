import { useMemo, useState, type ReactNode } from "react";
import { IssueDetails } from "@/client/features/audit/results/IssueDetails";
import { ChevronRight } from "lucide-react";
import { sort } from "remeda";
import {
  ISSUE_SEVERITY_ORDER,
  type IssueSeverity,
} from "@/shared/audit-issues";
import {
  filterIssues,
  resolveIssueSeverity,
  summarizeIssues,
  type IssueViewFilter,
} from "@/client/features/audit/results/pageInsights";
import { Button } from "@/client/components/ui/button";
import { getAuditIssueCopy } from "@/client/features/audit/issueLabels";
import { t } from "@/shared/i18n";
import type { AuditResultsData } from "@/client/features/audit/results/types";
import { SeverityBadge } from "@/client/features/audit/shared";
import { EmptyState } from "@/client/components/EmptyState";

type AuditIssueRow = AuditResultsData["issues"][number];

const MAX_RENDERED_URLS = 100;

const SEVERITY_RULE: Record<IssueSeverity, string> = {
  critical: "border-l-destructive/60",
  warning: "border-l-warning/60",
  info: "border-l-info/60",
};

const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  critical: t("common.critical"),
  warning: t("common.warning"),
  info: t("common.info"),
};

interface IssueGroup {
  issueType: string;
  severity: IssueSeverity;
  title: string;
  explanation: string;
  howToFix: string;
  issues: AuditIssueRow[];
}

function groupIssues(issues: AuditIssueRow[]): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  for (const issue of issues) {
    let group = groups.get(issue.issueType);
    if (!group) {
      const copy = getAuditIssueCopy(issue.issueType);
      group = {
        issueType: issue.issueType,
        severity: resolveIssueSeverity(issue),
        title: copy.title,
        explanation: copy.explanation,
        howToFix: copy.howToFix,
        issues: [],
      };
      groups.set(issue.issueType, group);
    }
    group.issues.push(issue);
  }

  return sort(
    Array.from(groups.values()),
    (a, b) =>
      ISSUE_SEVERITY_ORDER[a.severity] - ISSUE_SEVERITY_ORDER[b.severity] ||
      b.issues.length - a.issues.length,
  );
}

const SEVERITY_ORDER_LIST = ["critical", "warning", "info"] as const;

function IssueFilterBar({
  issues,
  filter,
  onFilterChange,
}: {
  issues: AuditIssueRow[];
  filter: IssueViewFilter;
  onFilterChange: (filter: IssueViewFilter) => void;
}) {
  const counts = useMemo(() => summarizeIssues(issues).counts, [issues]);
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
      <Button
        size="xs"
        variant={filter.severity === "all" ? "secondary" : "ghost"}
        onClick={() => onFilterChange({ ...filter, severity: "all" })}
      >
        {t("auditDetail.issuesAll")}{" "}
        <span className="tabular-nums">{issues.length}</span>
      </Button>
      {SEVERITY_ORDER_LIST.map((severity) => (
        <Button
          key={severity}
          size="xs"
          variant={filter.severity === severity ? "secondary" : "ghost"}
          disabled={counts[severity] === 0}
          onClick={() => onFilterChange({ ...filter, severity })}
        >
          {SEVERITY_LABEL[severity]}{" "}
          <span className="tabular-nums">{counts[severity]}</span>
        </Button>
      ))}
      {filter.issueType ? (
        <>
          <span className="text-xs text-muted-foreground">
            {t("auditDetail.issuesFilteredBy", {
              title: getAuditIssueCopy(filter.issueType).title,
            })}
          </span>
          <Button
            size="xs"
            variant="outline"
            onClick={() => onFilterChange({ ...filter, issueType: null })}
          >
            {t("auditDetail.issuesClearFilter")}
          </Button>
        </>
      ) : null}
    </div>
  );
}

export function IssuesView({
  issues: allIssues,
  tabs,
  filter,
  onFilterChange,
}: {
  issues: AuditIssueRow[];
  tabs: ReactNode;
  filter: IssueViewFilter;
  onFilterChange: (filter: IssueViewFilter) => void;
}) {
  const issues = useMemo(
    () => filterIssues(allIssues, filter),
    [allIssues, filter],
  );
  const groups = useMemo(() => groupIssues(issues), [issues]);

  const sections = useMemo(
    () =>
      (["critical", "warning", "info"] as const)
        .map((severity) => ({
          severity,
          groups: groups.filter((group) => group.severity === severity),
        }))
        .filter((section) => section.groups.length > 0),
    [groups],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {tabs}
      {allIssues.length > 0 ? (
        <IssueFilterBar
          issues={allIssues}
          filter={filter}
          onFilterChange={onFilterChange}
        />
      ) : null}
      {issues.length === 0 ? (
        <EmptyState
          variant="plain"
          title={
            allIssues.length === 0
              ? t("audit.noIssuesFound")
              : t("auditDetail.issuesNoMatch")
          }
          description={
            allIssues.length === 0 ? t("audit.allPagesPassed") : undefined
          }
        />
      ) : (
        <div>
          {sections.map((section) => (
            <IssueSection
              key={section.severity}
              section={section}
              openType={filter.issueType}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function IssueSection({
  section,
  openType,
}: {
  section: { severity: IssueSeverity; groups: IssueGroup[] };
  openType: string | null;
}) {
  const issueCount = section.groups.reduce(
    (sum, group) => sum + group.issues.length,
    0,
  );

  return (
    <div className="border-t border-border first:border-t-0">
      <div className="flex items-center gap-2 bg-muted/50 px-4 py-1.5 border-b border-border">
        <SeverityBadge severity={section.severity}>
          {SEVERITY_LABEL[section.severity]}
          <span className="tabular-nums">{issueCount}</span>
        </SeverityBadge>
      </div>
      <div className="divide-y divide-border">
        {section.groups.map((group) => (
          <IssueRow
            key={`${group.issueType}:${openType === group.issueType}`}
            group={group}
            defaultOpen={openType === group.issueType}
          />
        ))}
      </div>
    </div>
  );
}

function IssueRow({
  group,
  defaultOpen,
}: {
  group: IssueGroup;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={
        open
          ? `border-l-2 ${SEVERITY_RULE[group.severity]} bg-muted/30`
          : "border-l-2 border-l-transparent"
      }
    >
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="text-sm font-medium flex-1 min-w-0 truncate">
          {group.title}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground shrink-0">
          {t("ui.pageCount", { n: group.issues.length })}
        </span>
        <ChevronRight
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-90" : ""
          }`}
        />
      </button>

      {open && (
        <div className="pl-4 pr-4 pb-4 pt-0.5 space-y-3">
          {group.explanation && (
            <p className="text-sm text-muted-foreground max-w-prose">
              {group.explanation}
            </p>
          )}
          {group.howToFix && (
            <p className="text-sm max-w-prose">
              <span className="font-medium">{t("audit.howToFix")} </span>
              <span className="text-foreground/80">{group.howToFix}</span>
            </p>
          )}
          <AffectedUrlList issues={group.issues} />
        </div>
      )}
    </div>
  );
}

function AffectedUrlList({ issues }: { issues: AuditIssueRow[] }) {
  const rendered = issues.slice(0, MAX_RENDERED_URLS);
  const remaining = issues.length - rendered.length;

  return (
    <div className="max-h-[320px] overflow-y-auto rounded border border-border bg-card">
      {rendered.map((issue) => (
        <div
          key={issue.id}
          className="px-3 py-1.5 text-sm flex flex-col gap-0.5 border-b border-border last:border-b-0"
        >
          <a
            className="text-foreground/80 truncate hover:underline"
            href={issue.pageUrl}
            target="_blank"
            rel="noreferrer"
            title={issue.pageUrl}
          >
            {issue.pageUrl}
          </a>
          <IssueDetails detailsJson={issue.detailsJson} />
        </div>
      ))}
      {remaining > 0 && (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          {t("ui.andMoreExportTheIssuesCsv", { v0: remaining })}
        </div>
      )}
    </div>
  );
}
