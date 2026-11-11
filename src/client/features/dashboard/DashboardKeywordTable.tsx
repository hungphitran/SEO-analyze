import { ExternalPage } from "./siteTabParts";
import type { ColumnDef } from "@tanstack/react-table";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import type { ComponentProps } from "react";
import { DashboardDataTable } from "./DashboardDataTable";
import { t } from "@/shared/i18n";

type Keyword = {
  query: string;
  page?: string;
  clicks: number;
  impressions: number;
  position: number;
};
const columns: ColumnDef<Keyword>[] = [
  {
    accessorKey: "query",
    header: ({ column }) => <SortableHeader column={column} label={t("ui.keyword")} />,
    filterFn: "includesString",
  },
  ...(["impressions", "clicks", "position"] as const).map(
    (id) =>
      ({
        accessorKey: id,
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label={
              id === "position"
                ? t("ui.avgPosition")
                : id === "clicks"
                  ? t("ui.clicks")
                  : t("ui.impressions")
            }
            align="right"
          />
        ),
        cell: ({ getValue }) =>
          id === "position"
            ? Number(getValue()).toFixed(1)
            : Number(getValue()).toLocaleString(),
        filterFn: "inNumberRange",
        meta: {
          headerClassName: "text-right",
          cellClassName: "text-right tabular-nums",
        },
      }) satisfies ColumnDef<Keyword>,
  ),
];
export function DashboardKeywordTable({
  rows,
  showPages = false,
  sortBy = "impressions",
  ...tableProps
}: {
  rows: Keyword[];
  showPages?: boolean;
  sortBy?: "impressions" | "clicks";
} & Pick<
  ComponentProps<typeof DashboardDataTable>,
  "tabs" | "resetKey" | "isLoading" | "error" | "empty"
>) {
  const pageColumn: ColumnDef<Keyword> = {
    accessorKey: "page",
    header: t("ui.page"),
    filterFn: "includesString",
    cell: ({ row }) => <ExternalPage url={row.original.page ?? null} />,
  };
  return (
    <DashboardDataTable
      {...tableProps}
      rows={rows}
      columns={
        showPages ? [columns[0], pageColumn, ...columns.slice(1)] : columns
      }
      initialSorting={[{ id: sortBy, desc: true }]}
      filters={[
        { id: "query", label: t("ui.keyword"), kind: "text" },
        ...(showPages
          ? [{ id: "page", label: t("ui.page"), kind: "text" as const }]
          : []),
        { id: "impressions", label: t("ui.impressions"), kind: "number" },
        { id: "clicks", label: t("ui.clicks"), kind: "number" },
        { id: "position", label: t("ui.averagePosition"), kind: "number" },
      ]}
    />
  );
}
