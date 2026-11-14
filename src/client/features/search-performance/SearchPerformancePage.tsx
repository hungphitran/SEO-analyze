import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { QueryError } from "@/client/components/QueryState";
import { ExportMenu } from "@/client/components/ExportMenu";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Spinner } from "@/client/components/ui/spinner";
import { DataTableTabs } from "@/client/components/table/DataTableToolbar";
import { GoogleConnectionCard } from "@/client/features/integrations/GoogleConnectionCard";
import { DimensionSection } from "@/client/features/search-performance/SearchPerformanceDimensionSection";
import { SearchInspectionTab } from "@/client/features/search-performance/SearchInspectionTab";
import { SearchSitemapsTab } from "@/client/features/search-performance/SearchSitemapsTab";
import { SearchPerformanceTabTriggers } from "@/client/features/search-performance/SearchPerformanceTabTriggers";
import {
  isPropertyTab,
  tableDimensionForTab,
} from "@/client/features/search-performance/searchPerformanceTabs";
import { SearchPerformanceSelects } from "@/client/features/search-performance/SearchPerformanceSelects";
import { SearchPerformanceLoadingState } from "@/client/features/search-performance/SearchPerformanceLoadingState";
import {
  tableQueryOptions,
  type FilterInput,
} from "@/client/features/search-performance/searchPerformanceQueries";
import {
  SearchPerformanceTextFilters,
  type TextFilters,
} from "@/client/features/search-performance/SearchPerformanceTextFilters";
import {
  exportDimensionRows,
  exportStriking,
  StrikingDistanceTable,
  TotalsTable,
  type ExportTarget,
} from "@/client/features/search-performance/SearchPerformanceParts";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  exportSearchPerformanceTable,
  getSearchInsights,
  getSearchPerformanceReport,
} from "@/serverFunctions/searchPerformance";
import {
  CannibalizationTable,
  DecliningPagesTable,
} from "@/client/features/search-performance/SearchInsightsTables";
import {
  SEARCH_PERFORMANCE_DEFAULT_PAGE_SIZE,
  SEARCH_PERFORMANCE_TABS,
  type SearchPerformanceSearch,
  type SearchPerformanceTab,
} from "@/types/schemas/search-performance";
import { t } from "@/shared/i18n";

function isInsightsTab(
  tab: SearchPerformanceTab,
): tab is "cannibalization" | "declining" {
  return tab === "cannibalization" || tab === "declining";
}

function buildFilterInput({
  range = "last_28_days",
  device,
  country,
}: Pick<SearchPerformanceSearch, "range" | "device" | "country">): FilterInput {
  return {
    dateRange: range,
    ...(device ? { device } : {}),
    ...(country ? { country } : {}),
  };
}

export function SearchPerformancePage({
  projectId,
  search,
  onSearchChange,
}: {
  projectId: string;
  search: SearchPerformanceSearch;
  onSearchChange: (update: Partial<SearchPerformanceSearch>) => void;
}) {
  const queryClient = useQueryClient();
  const { range, device, country } = search;
  const textFilters = useMemo<TextFilters>(
    () => ({
      pageFilter: search.pageText
        ? {
            operator: search.pageMatch ?? "contains",
            expression: search.pageText,
          }
        : undefined,
      queryFilter: search.queryText
        ? {
            operator: search.queryMatch ?? "contains",
            expression: search.queryText,
          }
        : undefined,
    }),
    [search.pageText, search.pageMatch, search.queryText, search.queryMatch],
  );
  const [showFilters, setShowFilters] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const activeFilterCount =
    Number(Boolean(textFilters.pageFilter)) +
    Number(Boolean(textFilters.queryFilter)) +
    Number(Boolean(country)) +
    Number(Boolean(device)) +
    Number(range !== undefined && range !== "last_28_days");
  const tab = search.tab ?? "striking";
  const page = search.page ?? 1;
  const pageSize = search.size ?? SEARCH_PERFORMANCE_DEFAULT_PAGE_SIZE;

  const filterInput = {
    ...buildFilterInput({ range, device, country }),
    ...textFilters,
  };

  const reportQuery = useQuery({
    queryKey: ["searchPerformance", projectId, filterInput],
    queryFn: () =>
      getSearchPerformanceReport({ data: { projectId, ...filterInput } }),
    placeholderData: keepPreviousData,
  });
  const report = reportQuery.data;

  const tabDimension = tableDimensionForTab(tab);
  // The query table is the fallback only so the hook below always has a key.
  const dimension = tabDimension ?? "query";
  const tableQuery = useQuery({
    ...tableQueryOptions(projectId, dimension, page, pageSize, filterInput),
    enabled: report?.connected === true && tabDimension !== null,
    // Hold the current rows while paging or filtering, but not across a tab
    // or project change: Query rows must not render under the Pages header.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === projectId &&
      previousQuery.queryKey[2] === dimension
        ? previous
        : undefined,
  });

  // Cannibalization / declining pages: three GSC calls, only when opened.
  const insightsQuery = useQuery({
    queryKey: ["searchInsights", projectId, filterInput],
    queryFn: () => getSearchInsights({ data: { projectId, ...filterInput } }),
    enabled: report?.connected === true && isInsightsTab(tab),
    staleTime: 5 * 60_000,
  });

  // Warm the Queries tab (first page) as soon as the report connects so the tab
  // opens instantly instead of showing a spinner. Free first-party GSC data.
  useEffect(() => {
    if (report?.connected !== true) return;
    void queryClient.prefetchQuery(
      tableQueryOptions(
        projectId,
        "query",
        1,
        SEARCH_PERFORMANCE_DEFAULT_PAGE_SIZE,
        { ...buildFilterInput({ range, device, country }), ...textFilters },
      ),
    );
  }, [
    report?.connected,
    projectId,
    range,
    device,
    country,
    textFilters,
    queryClient,
  ]);

  const handleExport = async (target: ExportTarget) => {
    if (
      !report?.connected ||
      reportQuery.isPlaceholderData ||
      isExporting ||
      isInsightsTab(tab) ||
      isPropertyTab(tab)
    )
      return;
    setIsExporting(true);
    try {
      if (tab === "striking") {
        await exportStriking(report, target);
        return;
      }
      const data = await exportSearchPerformanceTable({
        data: { projectId, dimension, ...filterInput },
      });
      await exportDimensionRows(dimension, data.rows, report.range, target);
    } catch (error) {
      toast.error(
        getStandardErrorMessage(error, t("gscInsights.exportFailed")),
      );
    } finally {
      setIsExporting(false);
    }
  };

  const resetFilters = () =>
    onSearchChange({
      page: undefined,
      pageText: undefined,
      pageMatch: undefined,
      queryText: undefined,
      queryMatch: undefined,
      country: undefined,
      device: undefined,
      range: undefined,
    });

  const reportError = (
    <QueryError
      error={reportQuery.error}
      fallback={t("gscInsights.failedToLoad")}
      onRetry={() => void reportQuery.refetch()}
      isRetrying={reportQuery.isFetching}
    />
  );

  const filtersPanel = (
    <SearchPerformanceTextFilters
      // Remount on URL changes (back/forward) so the draft matches.
      key={JSON.stringify(textFilters)}
      value={textFilters}
      activeFilterCount={activeFilterCount}
      onApply={(filters) => {
        onSearchChange({
          page: undefined,
          pageText: filters.pageFilter?.expression,
          pageMatch: filters.pageFilter?.operator,
          queryText: filters.queryFilter?.expression,
          queryMatch: filters.queryFilter?.operator,
        });
      }}
      onReset={resetFilters}
    />
  );

  return (
    <div className="overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">
              {t("gscInsights.pageTitle")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("gscInsights.pageDesc")}
            </p>
          </div>
          {report?.connected ? (
            <Link
              to="/p/$projectId/settings/integrations"
              params={{ projectId }}
              className="shrink-0 self-start text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:mt-1"
            >
              {t("gscInsights.changeProperty")}
            </Link>
          ) : null}
        </div>

        {reportQuery.isPending ? (
          <SearchPerformanceLoadingState />
        ) : !report ? (
          <>
            {filtersPanel}
            {reportError}
          </>
        ) : !report.connected ? (
          <div className="max-w-2xl">
            <GoogleConnectionCard provider="gsc" projectId={projectId} />
          </div>
        ) : (
          <>
            {reportQuery.isError ? reportError : null}
            {reportQuery.isPlaceholderData ? (
              <SearchPerformanceLoadingState />
            ) : (
              <TotalsTable report={report} />
            )}
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <DataTableTabs
                value={tab}
                onValueChange={(value) => {
                  const nextTab = SEARCH_PERFORMANCE_TABS.find(
                    (item) => item === value,
                  );
                  if (nextTab)
                    onSearchChange({ tab: nextTab, page: undefined });
                }}
                actions={
                  <ExportMenu
                    actions={["sheets", "csv"]}
                    onExport={(target) => void handleExport(target)}
                    busy={isExporting}
                    disabled={
                      reportQuery.isPlaceholderData ||
                      isInsightsTab(tab) ||
                      isPropertyTab(tab)
                    }
                  />
                }
              >
                <SearchPerformanceTabTriggers
                  strikingLabel={
                    reportQuery.isPlaceholderData
                      ? t("gscInsights.strikingDistance")
                      : `${t("gscInsights.strikingDistance")} (${report.strikingDistance.length})`
                  }
                />
              </DataTableTabs>
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
                <Button
                  type="button"
                  variant={showFilters ? "secondary" : "ghost"}
                  size="sm"
                  aria-expanded={showFilters}
                  aria-controls="search-performance-filters"
                  onClick={() => setShowFilters((current) => !current)}
                  title={t("gscInsights.toggleFilters")}
                >
                  <SlidersHorizontal data-icon="inline-start" />
                  {t("ui.filters")}
                  {activeFilterCount > 0 ? (
                    <Badge size="sm">{activeFilterCount}</Badge>
                  ) : null}
                </Button>
                {reportQuery.isFetching && !reportQuery.isPending ? (
                  <Spinner className="size-4 text-muted-foreground" />
                ) : null}
                <SearchPerformanceSelects
                  search={search}
                  countries={report.countries}
                  onSearchChange={onSearchChange}
                />
              </div>

              {showFilters ? filtersPanel : null}
              {tab === "sitemaps" ? (
                <SearchSitemapsTab projectId={projectId} />
              ) : tab === "inspection" ? (
                <SearchInspectionTab projectId={projectId} />
              ) : reportQuery.isPlaceholderData ? (
                <div className="p-8 text-sm" role="status">
                  {t("ui.loadingMatchingResults")}
                </div>
              ) : tab === "striking" ? (
                <StrikingDistanceTable
                  projectId={projectId}
                  rows={report.strikingDistance}
                  page={page}
                  pageSize={pageSize}
                  onPageChange={(nextPage) =>
                    onSearchChange({ page: nextPage })
                  }
                  onPageSizeChange={(size) =>
                    onSearchChange({ page: undefined, size })
                  }
                  isFiltered={activeFilterCount > 0}
                  onClearFilters={resetFilters}
                />
              ) : isInsightsTab(tab) ? (
                insightsQuery.isPending ? (
                  <div className="p-8 text-sm" role="status">
                    {t("ui.loadingMatchingResults")}
                  </div>
                ) : insightsQuery.isError || !insightsQuery.data?.connected ? (
                  <QueryError
                    error={insightsQuery.error}
                    fallback={t("gscInsights.insightsFailed")}
                    onRetry={() => void insightsQuery.refetch()}
                    isRetrying={insightsQuery.isFetching}
                  />
                ) : tab === "cannibalization" ? (
                  <CannibalizationTable
                    rows={insightsQuery.data.cannibalization}
                  />
                ) : (
                  <DecliningPagesTable rows={insightsQuery.data.declining} />
                )
              ) : (
                <DimensionSection
                  projectId={projectId}
                  tableQuery={tableQuery}
                  dimension={dimension}
                  page={page}
                  pageSize={pageSize}
                  onPageChange={(nextPage) =>
                    onSearchChange({ page: nextPage })
                  }
                  onPageSizeChange={(size) =>
                    onSearchChange({ page: undefined, size })
                  }
                  isFiltered={activeFilterCount > 0}
                  onClearFilters={resetFilters}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
