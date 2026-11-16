import { useMemo, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { type SortingState, type VisibilityState } from "@tanstack/react-table";
import { toast } from "sonner";
import { DataTable, useDataTable } from "@/client/components/table/DataTable";
import { Button } from "@/client/components/ui/button";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { submitIndexNowUrls } from "@/serverFunctions/indexnow";
import {
  countActiveFilters,
  PagesFilterBar,
  ResultsTableToolbar,
} from "@/client/features/audit/results/AuditResultsTableFilters";
import {
  EMPTY_PAGES_FILTERS,
  filterPages,
  type PagesFilters,
} from "@/client/features/audit/results/AuditResultsTableFilterLogic";
import { ColumnPicker } from "@/client/features/audit/results/ColumnPicker";
import { PageDetailSheet } from "@/client/features/audit/results/PageDetailSheet";
import {
  indexIssuesByPage,
  issueCountsByPage,
} from "@/client/features/audit/results/pageInsights";
import { buildPagesColumns } from "@/client/features/audit/results/PagesTableColumns";
import {
  buildOptionalPagesColumns,
  DEFAULT_COLUMN_VISIBILITY,
} from "@/client/features/audit/results/PagesTableOptionalColumns";
import { predominantHost } from "@/client/features/audit/results/pagesTableCells";
import type { AuditResultsData } from "@/client/features/audit/results/types";
import { t } from "@/shared/i18n";

export function PagesTable({
  pages,
  startUrl,
  issues,
  lighthouse,
  projectId,
  auditId,
  tabs,
}: {
  pages: AuditResultsData["pages"];
  startUrl: string;
  issues: AuditResultsData["issues"];
  lighthouse: AuditResultsData["lighthouse"];
  projectId: string;
  auditId: string;
  tabs: ReactNode;
}) {
  const [filters, setFilters] = useState<PagesFilters>(EMPTY_PAGES_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    DEFAULT_COLUMN_VISIBILITY,
  );
  const [openPageId, setOpenPageId] = useState<string | null>(null);
  // URL order reads as a site inventory; status-first would open the table
  // on its most boring rows (redirects) whenever a site has no errors.
  const [sorting, setSorting] = useState<SortingState>([
    { id: "url", desc: false },
  ]);
  const activeFilterCount = countActiveFilters(filters, EMPTY_PAGES_FILTERS);
  const issuesByPage = useMemo(() => indexIssuesByPage(issues), [issues]);
  const issueCounts = useMemo(
    () => issueCountsByPage(issuesByPage),
    [issuesByPage],
  );
  const filteredPages = useMemo(
    () => filterPages(pages, filters, issueCounts),
    [filters, pages, issueCounts],
  );
  const indexableUrls = useMemo(
    () =>
      filteredPages
        .filter(
          (page) =>
            page.statusCode === 200 &&
            page.isIndexable &&
            page.fetchClass === "ok",
        )
        .map((page) => page.url)
        .slice(0, 500),
    [filteredPages],
  );
  const submitIndexNow = useMutation({
    mutationFn: (urls: string[]) =>
      submitIndexNowUrls({ data: { projectId, urls } }),
    onSuccess: (result) => {
      const failed = result.hosts.filter((host) => host.status === "failed");
      const sent = result.hosts
        .filter((host) => host.status === "submitted")
        .reduce((count, host) => count + host.urlCount, 0);
      if (sent > 0) {
        toast.success(t("indexNow.submitted", { count: sent }));
      }
      for (const host of failed) {
        toast.error(t("indexNow.couldNotSubmit"), {
          description: host.message,
          duration: 10_000,
        });
      }
      if (sent === 0 && failed.length === 0) {
        toast.info(t("audit.indexNowNoMatchingUrls"));
      }
    },
    onError: (error: Error) => toast.error(getStandardErrorMessage(error)),
  });
  const columns = useMemo(() => {
    const canonicalHost = predominantHost(pages, startUrl);
    return [
      ...buildPagesColumns({
        canonicalHost,
        issueCounts,
        missingTitlePageIds: new Set(
          issues
            .filter((issue) => issue.issueType === "missing-title")
            .map((issue) => issue.pageId)
            .filter((pageId): pageId is string => pageId !== null),
        ),
      }),
      ...buildOptionalPagesColumns(canonicalHost),
    ];
  }, [issueCounts, issues, pages, startUrl]);
  const table = useDataTable({
    data: filteredPages,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getRowId: (row) => row.id,
    withSorting: true,
  });

  const resetFilters = () => setFilters(EMPTY_PAGES_FILTERS);
  const openPage = pages.find((page) => page.id === openPageId) ?? null;

  return (
    <>
      <DataTable
        table={table}
        empty={{ title: t("audit.noPagesCrawled") }}
        isFiltered={activeFilterCount > 0}
        onClearFilters={resetFilters}
        onRowClick={(row) => setOpenPageId(row.original.id)}
        activeRowId={openPageId ?? undefined}
        toolbar={
          <>
            {tabs}
            <ResultsTableToolbar
              showFilters={showFilters}
              onToggle={() => setShowFilters((current) => !current)}
              activeFilterCount={activeFilterCount}
              resultCount={filteredPages.length}
              totalCount={pages.length}
              actions={
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      indexableUrls.length === 0 || submitIndexNow.isPending
                    }
                    onClick={() => submitIndexNow.mutate(indexableUrls)}
                  >
                    {submitIndexNow.isPending
                      ? t("audit.indexNowSending")
                      : t("audit.indexNowSubmit", {
                          count: indexableUrls.length,
                        })}
                  </Button>
                  <ColumnPicker
                    visibility={columnVisibility}
                    onChange={setColumnVisibility}
                  />
                </>
              }
            />
            {showFilters ? (
              <PagesFilterBar
                filters={filters}
                onChange={setFilters}
                activeFilterCount={activeFilterCount}
                onReset={resetFilters}
              />
            ) : null}
          </>
        }
      />
      <PageDetailSheet
        page={openPage}
        issues={openPage ? (issuesByPage.get(openPage.id) ?? []) : []}
        lighthouse={lighthouse}
        projectId={projectId}
        auditId={auditId}
        onClose={() => setOpenPageId(null)}
      />
    </>
  );
}
