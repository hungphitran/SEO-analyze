import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import {
  DataTable,
  useDataTable,
  useSelectionAnchor,
} from "@/client/components/table/DataTable";
import {
  TableBulkActionBar,
  TableBulkActionButton,
} from "@/client/components/table/TableBulkActionBar";
import { TablePagination } from "@/client/components/table/TablePagination";
import { Button } from "@/client/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import {
  buildDimensionColumns,
  buildStrikingColumns,
  formatCount,
  formatCtr,
  formatPosition,
  type Report,
  type SearchPerformanceTableRow,
} from "@/client/features/search-performance/SearchPerformanceColumns";
import {
  dimensionExportSlug,
  dimensionKeyLabel,
  formatDimensionKey,
} from "@/client/features/search-performance/searchPerformanceTabs";
import { normalizeExportValue, type CsvValue } from "@/client/lib/csv";
import { exportRows } from "@/client/lib/exportRows";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  SEARCH_PERFORMANCE_PAGE_SIZES,
  type SearchPerformanceTableDimension,
} from "@/types/schemas/search-performance";
import { saveKeywords } from "@/serverFunctions/keywords";
import { t } from "@/shared/i18n";
import { useFreeSourcesOnly } from "@/client/lib/free-sources-mode";

export type ExportTarget = "csv" | "sheets";

type ExportTable = { filename: string; headers: string[]; rows: CsvValue[][] };

function strikingExportTable(report: Report): ExportTable {
  const stamp = `${report.range.startDate}-to-${report.range.endDate}`;
  return {
    filename: `search-performance-striking-distance-${stamp}`,
    headers: [
      t("ui.query"),
      t("ui.page"),
      t("ui.impressions"),
      t("ui.clicks"),
      t("ui.position"),
    ],
    rows: report.strikingDistance.map((row) => [
      row.query,
      row.page,
      row.impressions,
      row.clicks,
      row.position,
    ]),
  };
}

function dimensionExportTable(
  dimension: SearchPerformanceTableDimension,
  rows: SearchPerformanceTableRow[],
  stamp: string,
): ExportTable {
  return {
    filename: `search-performance-${dimensionExportSlug(dimension)}-${stamp}`,
    headers: [
      dimensionKeyLabel(dimension),
      t("ui.clicks"),
      t("ui.impressions"),
      "CTR",
      t("ui.position"),
    ],
    rows: rows.map((row) => [
      row.key,
      row.clicks,
      row.impressions,
      row.ctr,
      row.position,
    ]),
  };
}

function runExport(table: ExportTable, target: ExportTarget): Promise<void> {
  return exportRows({
    format: target,
    feature: "search_performance",
    ...table,
  });
}

export function exportStriking(
  report: Report,
  target: ExportTarget,
): Promise<void> {
  return runExport(strikingExportTable(report), target);
}

/** Export the full queries/pages dataset (fetched separately, not the visible
 *  page) so pagination never truncates a download. */
export function exportDimensionRows(
  dimension: SearchPerformanceTableDimension,
  rows: SearchPerformanceTableRow[],
  range: Report["range"],
  target: ExportTarget,
): Promise<void> {
  const stamp = `${range.startDate}-to-${range.endDate}`;
  return runExport(dimensionExportTable(dimension, rows, stamp), target);
}

type Delta = { text: string; improved: boolean } | null;

function percentDelta(current: number, previous: number): Delta {
  if (previous <= 0) return null;
  const change = (current - previous) / previous;
  const pct = (change * 100).toFixed(1);
  return { text: `${change >= 0 ? "+" : ""}${pct}%`, improved: change >= 0 };
}

/** Position falls as rankings improve, so the delta is inverted. */
function positionDelta(current: number, previous: number): Delta {
  if (previous <= 0 || current <= 0) return null;
  const change = previous - current;
  return {
    text: `${change >= 0 ? "+" : ""}${change.toFixed(1)}`,
    improved: change >= 0,
  };
}

export function TotalsTable({ report }: { report: Report }) {
  const { totals, prevTotals, range } = report;
  const deltaTitle = t("gscInsights.comparedWith", {
    start: range.prevStartDate,
    end: range.prevEndDate,
  });
  const metrics = [
    {
      label: t("ui.clicks"),
      value: formatCount(totals.clicks),
      delta: percentDelta(totals.clicks, prevTotals.clicks),
    },
    {
      label: t("ui.impressions"),
      value: formatCount(totals.impressions),
      delta: percentDelta(totals.impressions, prevTotals.impressions),
    },
    {
      label: t("ui.clickThroughRate"),
      value: formatCtr(totals.ctr),
      delta: percentDelta(totals.ctr, prevTotals.ctr),
    },
    {
      label: t("ui.averagePosition"),
      value: formatPosition(totals.position),
      delta: positionDelta(totals.position, prevTotals.position),
    },
  ];
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-full">{t("gscInsights.metric")}</TableHead>
            <TableHead className="min-w-32 text-right">
              {t("gscInsights.value")}
            </TableHead>
            <TableHead className="min-w-32 text-right" title={deltaTitle}>
              {t("ui.change")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {metrics.map(({ label, value, delta }) => (
            <TableRow key={label}>
              <TableCell>{label}</TableCell>
              <TableCell className="text-right tabular-nums">{value}</TableCell>
              <TableCell
                className={`text-right tabular-nums ${delta ? (delta.improved ? "text-success" : "text-destructive") : "text-muted-foreground"}`}
                title={deltaTitle}
              >
                {delta?.text ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function DimensionTable({
  rows,
  dimension,
  isFiltered,
  isPastEnd,
  onClearFilters,
  onFirstPage,
}: {
  rows: SearchPerformanceTableRow[];
  dimension: SearchPerformanceTableDimension;
  isFiltered: boolean;
  isPastEnd: boolean;
  onClearFilters: () => void;
  onFirstPage: () => void;
}) {
  const columns = useMemo(
    () =>
      buildDimensionColumns(dimensionKeyLabel(dimension), (key) =>
        formatDimensionKey(dimension, key),
      ),
    [dimension],
  );
  const table = useDataTable({
    data: rows,
    columns,
    withSorting: true,
    // A daily table reads in date order; the others rank by clicks.
    initialState: {
      sorting: dimension === "date" ? [] : [{ id: "clicks", desc: true }],
    },
  });
  return (
    <DataTable
      table={table}
      isFiltered={isFiltered && !isPastEnd}
      onClearFilters={onClearFilters}
      empty={
        isPastEnd
          ? {
              title: t("ui.noRowsOnThisPage"),
              description: t("ui.thisPageIsPastTheEnd"),
              action: (
                <Button variant="outline" size="sm" onClick={onFirstPage}>
                  {t("ui.goToFirstPage")}
                </Button>
              ),
            }
          : {
              title: t("ui.noSearchConsoleDataYet"),
              description:
                dimension === "searchAppearance"
                  ? t("gscDetail.appearanceEmpty")
                  : t("ui.searchConsoleDataCanTakeA"),
            }
      }
    />
  );
}

export function StrikingDistanceTable({
  projectId,
  rows,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  isFiltered,
  onClearFilters,
}: {
  projectId: string;
  rows: Report["strikingDistance"];
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  isFiltered: boolean;
  onClearFilters: () => void;
}) {
  const queryClient = useQueryClient();
  const anchorRef = useSelectionAnchor();
  const [rowSelection, setRowSelection] = useState({});
  const columns = useMemo(() => buildStrikingColumns(anchorRef), [anchorRef]);
  const table = useDataTable({
    data: rows,
    columns,
    withSorting: true,
    withPagination: true,
    enableRowSelection: true,
    state: { rowSelection, pagination: { pageIndex: page - 1, pageSize } },
    onRowSelectionChange: setRowSelection,
    // The server collapses each query to its top page, so queries are unique.
    getRowId: (row) => row.query,
    initialState: {
      sorting: [{ id: "impressions", desc: true }],
    },
  });
  const isPastEnd = page > 1 && table.getRowModel().rows.length === 0;

  const selectedQueries = table
    .getSelectedRowModel()
    .rows.map((row) => row.original.query);

  const copyKeywords = async () => {
    try {
      // Sanitize against spreadsheet formula injection: GSC query strings are
      // untrusted and may begin with =, +, -, @, etc. See @/client/lib/csv.
      const text = selectedQueries
        .map((query) => normalizeExportValue(query))
        .join("\n");
      await navigator.clipboard.writeText(text);
      toast.success(t("ui.copied", { v0: selectedQueries.length }));
    } catch {
      toast.error(t("gscInsights.couldntCopy"));
    }
  };

  // The saved-keywords list is a DataForSEO-only page, hidden in free mode.
  const freeSourcesOnly = useFreeSourcesOnly();
  const save = useMutation({
    mutationFn: (keywords: string[]) =>
      saveKeywords({ data: { projectId, keywords } }),
    onSuccess: (_result, keywords) => {
      captureClientEvent("keyword:save", {
        source_feature: "search_performance",
        keyword_count: keywords.length,
      });
      void queryClient.invalidateQueries({
        queryKey: ["savedKeywords", projectId],
      });
      toast.success(t("ui.saved", { v0: keywords.length }));
      setRowSelection({});
    },
  });

  return (
    <>
      <div className="p-4">
        <p className="mb-3 text-sm text-muted-foreground">
          {t("ui.queriesRankingAtPositions5To")}
        </p>
        <DataTable
          table={table}
          isFiltered={isFiltered && !isPastEnd}
          onClearFilters={onClearFilters}
          empty={
            isPastEnd
              ? {
                  title: t("ui.noRowsOnThisPage"),
                  description: t("ui.thisPageIsPastTheEnd"),
                  action: (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onPageChange(1)}
                    >
                      {t("ui.goToFirstPage")}
                    </Button>
                  ),
                }
              : {
                  title: t("ui.noStrikingDistanceQueries"),
                  description: t("ui.queriesRankingAtPositions5To_8962"),
                }
          }
        />
      </div>
      {!isPastEnd && rows.length > 0 && (
        <TablePagination
          page={page}
          pageSize={pageSize}
          pageSizes={SEARCH_PERFORMANCE_PAGE_SIZES}
          totalCount={rows.length}
          hasNextPage={table.getCanNextPage()}
          isLoading={false}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
      <TableBulkActionBar
        selectedCount={selectedQueries.length}
        selectedLabel={t("ui.queriesSelected")}
        onClear={() => setRowSelection({})}
        actions={
          <div className="flex items-center gap-1 px-1.5">
            <TableBulkActionButton
              icon={<Copy className="size-3.5" />}
              onClick={() => void copyKeywords()}
            >
              {t("ui.copyKeywords")}
            </TableBulkActionButton>
            {freeSourcesOnly ? null : (
              <TableBulkActionButton
                icon={
                  save.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Save className="size-3.5" />
                  )
                }
                onClick={() => save.mutate(selectedQueries)}
                disabled={save.isPending}
              >
                {t("ui.saveAsKeywords")}
              </TableBulkActionButton>
            )}
          </div>
        }
      />
    </>
  );
}
