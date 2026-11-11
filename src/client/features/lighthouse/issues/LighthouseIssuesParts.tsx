import { BackButton } from "@/client/components/PageHeader";
import { ExportMenu } from "@/client/components/ExportMenu";
import { SkeletonTableRows } from "@/client/components/SkeletonPresets";
import { Card, CardContent } from "@/client/components/ui/card";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import { SeverityBadge } from "@/client/features/audit/shared";
import type {
  CategoryTab,
  ExportPayload,
  LighthouseIssue,
  LighthouseMetrics,
  LighthouseScores,
} from "./types";
import { LighthouseIssueRow } from "./LighthouseIssueRow";
import { LighthouseIssuesSummary } from "./LighthouseIssuesSummary";
import { categoryLabel } from "./utils";
import { categoryTabs } from "./types";
import { t } from "@/shared/i18n";

export function LighthouseIssuesHeader({
  onBack,
  isLoading,
  scannedAt,
  finalUrl,
  scores,
  metrics,
  severityCounts,
}: {
  onBack: () => void;
  isLoading: boolean;
  scannedAt?: string;
  finalUrl?: string;
  scores?: LighthouseScores | null;
  metrics?: LighthouseMetrics | null;
  severityCounts: { critical: number; warning: number; info: number };
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <BackButton onClick={onBack}>{t("audit.siteAudit")}</BackButton>
        <span className="text-xs text-muted-foreground">
          {scannedAt
            ? t("ui.scanned", { v0: new Date(scannedAt).toLocaleString() })
            : isLoading
              ? t("audit.readingIssues")
              : null}
        </span>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">{t("audit.lighthouseIssues")}</h1>
            <p className="text-sm text-muted-foreground break-all">
              {finalUrl ?? (isLoading ? t("audit.loadingUrl") : null)}
            </p>
          </div>
          <LighthouseIssuesSummary scores={scores} metrics={metrics} />
          <div className="flex flex-wrap gap-2">
            <SeverityBadge severity="critical">{t("ui.critical", { v0: severityCounts.critical })}</SeverityBadge>
            <SeverityBadge severity="warning">{t("ui.warning", { v0: severityCounts.warning })}</SeverityBadge>
            <SeverityBadge severity="info">{t("ui.info", { v0: severityCounts.info })}</SeverityBadge>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

export function LighthouseIssuesToolbar({
  category,
  categoryCounts,
  selectedCategoryLabel,
  isBusy,
  visibleIssues,
  allIssues,
  onCategoryChange,
  onCopy,
  onExport,
  onExportRows,
}: {
  category: CategoryTab;
  categoryCounts: Record<CategoryTab, number>;
  selectedCategoryLabel: string;
  isBusy: boolean;
  visibleIssues: LighthouseIssue[];
  allIssues: LighthouseIssue[];
  onCategoryChange: (next: CategoryTab) => void;
  onCopy: (data: ExportPayload, toastMessage: string) => void;
  onExport: (data: ExportPayload) => void;
  onExportRows: (
    format: "csv" | "sheets",
    issues: LighthouseIssue[],
    variant: "all" | "current",
  ) => void;
}) {
  const exportCurrentCategory: ExportPayload =
    category === "all" ? { mode: "issues" } : { mode: "category", category };

  const categoryLabelLower = selectedCategoryLabel.toLowerCase();

  // One menu section per scope. The saved payload has no issue rows, so it
  // offers only the JSON formats.
  const scopes: Array<{
    id: string;
    label: string;
    actions?: Array<"copy-json" | "json">;
    issues: LighthouseIssue[];
    payload: ExportPayload;
    copied: string;
  }> = [
    {
      id: "current",
      label: t("ui.issues_77a6", { v0: selectedCategoryLabel }),
      issues: visibleIssues,
      payload: exportCurrentCategory,
      copied: t("ui.copiedIssues", { v0: categoryLabelLower }),
    },
    {
      id: "all",
      label: t("audit.allActionable"),
      issues: allIssues,
      payload: { mode: "issues" },
      copied: t("audit.copiedActionable"),
    },
    {
      id: "full",
      label: t("audit.savedPayload"),
      actions: ["copy-json", "json"],
      issues: [],
      payload: { mode: "full" },
      copied: t("audit.copiedPayload"),
    },
  ];

  return (
    <div className="border-b border-border px-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CategoryTabs
          category={category}
          categoryCounts={categoryCounts}
          onCategoryChange={onCategoryChange}
        />
        <ExportMenu
          actions={["sheets", "csv", "copy-json", "json"]}
          busy={isBusy}
          scopes={scopes}
          onExport={(action, scopeId) => {
            const scope = scopes.find((item) => item.id === scopeId);
            if (!scope) return;
            if (action === "copy-json") onCopy(scope.payload, scope.copied);
            else if (action === "json") onExport(scope.payload);
            else
              onExportRows(
                action,
                scope.issues,
                scopeId === "all" ? "all" : "current",
              );
          }}
        />
      </div>
    </div>
  );
}

function CategoryTabs({
  category,
  categoryCounts,
  onCategoryChange,
}: {
  category: CategoryTab;
  categoryCounts: Record<CategoryTab, number>;
  onCategoryChange: (next: CategoryTab) => void;
}) {
  return (
    <Tabs
      value={category}
      onValueChange={(next: CategoryTab) => onCategoryChange(next)}
    >
      <TabsList variant="line" className="h-auto! flex-wrap justify-start">
        {categoryTabs.map((tab) => (
          <TabsTrigger key={tab} value={tab}>
            {categoryLabel(tab)}
            <span className="text-xs text-muted-foreground">
              ({categoryCounts[tab]})
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

export function LighthouseIssueList({
  issues,
  isLoading,
  emptyMessage,
}: {
  issues: LighthouseIssue[];
  isLoading: boolean;
  emptyMessage?: string;
}) {
  if (isLoading) {
    return <SkeletonTableRows className="p-4" rows={5} columns={3} />;
  }
  if (!issues.length) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        {emptyMessage ?? t("audit.noActionableCategory")}
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead className="w-24">{t("common.severity")}</TableHead>
          <TableHead>{t("common.issue")}</TableHead>
          <TableHead className="hidden w-28 sm:table-cell">{t("audit.category")}</TableHead>
          <TableHead className="hidden w-28 md:table-cell text-right">
            {t("ui.impact")}
          </TableHead>
          <TableHead className="w-14 text-right">{t("kw.score")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {issues.map((issue, issueIndex) => (
          <LighthouseIssueRow
            key={`${issue.category}-${issue.auditKey}-${issueIndex}`}
            issue={issue}
          />
        ))}
      </TableBody>
    </Table>
  );
}
