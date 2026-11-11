import { useQuery } from "@tanstack/react-query";
import { QueryError } from "@/client/components/QueryState";
import { DataTableTabs } from "@/client/components/table/DataTableToolbar";
import type { ColumnDef } from "@tanstack/react-table";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import { DashboardDataTable } from "./DashboardDataTable";
import { useState, type ComponentProps } from "react";
import { TabsTrigger } from "@/client/components/ui/tabs";
import { getDashboardBacklinks } from "@/serverFunctions/dashboard";
import { Freshness, ExternalPage } from "./siteTabParts";
import { t } from "@/shared/i18n";
const KINDS = ["new", "lost", "all"] as const;
type Kind = (typeof KINDS)[number];

const DESCRIPTIONS: Record<Kind, string> = {
  new: t("ui.linksToYourWebsiteFoundIn"),
  lost: t("ui.linksThatWereFoundBeforeBut"),
  all: t("ui.recentlyFoundLinksThatStillPoint"),
};

export function DashboardBacklinks({
  projectId,
  domain,
}: {
  projectId: string;
  domain: string;
}) {
  const [kind, setKind] = useState<Kind>("new");
  const query = useQuery({
    queryKey: ["dashboardBacklinks", projectId, domain, kind],
    queryFn: () => getDashboardBacklinks({ data: { projectId, kind } }),
    staleTime: 86400_000,
    retry: false,
  });
  return (
    <DashboardBacklinkTable
      rows={query.data?.value ?? []}
      kind={kind}
      isLoading={query.isPending}
      error={
        query.isError ? (
          <QueryError
            error={query.error}
            fallback={t("ui.couldNotLoadBacklinks")}
            onRetry={() => void query.refetch()}
            isRetrying={query.isFetching}
          />
        ) : null
      }
      tabs={
        <DataTableTabs
          value={kind}
          onValueChange={(value) => {
            const next = KINDS.find((item) => item === value);
            if (next) setKind(next);
          }}
          description={
            <>
              {DESCRIPTIONS[kind]}
              {query.data ? <Freshness {...query.data} /> : null}
            </>
          }
        >
          <TabsTrigger value="new">{t("ui.newThisWeek")}</TabsTrigger>
          <TabsTrigger value="lost">{t("ui.lostLinks")}</TabsTrigger>
          <TabsTrigger value="all">{t("ui.activeLinks")}</TabsTrigger>
        </DataTableTabs>
      }
    />
  );
}

type Backlink = Awaited<
  ReturnType<typeof getDashboardBacklinks>
>["value"][number];
function DashboardBacklinkTable({
  rows,
  kind,
  ...tableProps
}: {
  rows: Backlink[];
  kind: Kind;
} & Pick<
  ComponentProps<typeof DashboardDataTable>,
  "tabs" | "isLoading" | "error"
>) {
  const columns: ColumnDef<Backlink>[] = [
    {
      id: "urlFrom",
      accessorFn: (row) => `${row.domainFrom ?? ""} ${row.urlFrom ?? ""}`,
      header: ({ column }) => (
        <SortableHeader column={column} label={t("ui.referringPage")} />
      ),
      cell: ({ row }) => (
        <ExternalPage
          url={row.original.urlFrom}
          label={row.original.domainFrom}
        />
      ),
      filterFn: "includesString",
    },
    {
      accessorKey: "anchor",
      header: t("ui.anchor"),
      cell: ({ row }) => (
        <span
          className="block max-w-48 truncate"
          title={row.original.anchor ?? undefined}
        >
          {row.original.anchor || "—"}
        </span>
      ),
      filterFn: "includesString",
    },
    {
      accessorKey: "urlTo",
      header: t("ui.targetPage"),
      cell: ({ row }) => <ExternalPage url={row.original.urlTo} />,
      filterFn: "includesString",
    },
    {
      id: "follow",
      accessorFn: (row) => (row.isDofollow ? "Follow" : "Nofollow"),
      header: t("ui.linkType"),
      filterFn: "equalsString",
    },
    {
      accessorKey: "domainFromRank",
      header: ({ column }) => (
        <SortableHeader column={column} label={t("ui.domainRank")} />
      ),
      filterFn: "inNumberRange",
      cell: ({ getValue }) => getValue() ?? "—",
    },
    {
      accessorKey: "spamScore",
      header: ({ column }) => (
        <SortableHeader column={column} label={t("ui.spamScore")} />
      ),
      filterFn: "inNumberRange",
      cell: ({ getValue }) => getValue() ?? "—",
    },
    {
      id: "date",
      accessorFn: (row) =>
        (kind === "lost" ? row.lastSeen : row.firstSeen)?.slice(0, 10) ?? "—",
      header: ({ column }) => (
        <SortableHeader
          column={column}
          label={kind === "lost" ? t("ui.lastChecked") : t("ui.firstDiscovered")}
        />
      ),
    },
  ];
  return (
    <DashboardDataTable
      {...tableProps}
      resetKey={kind}
      rows={rows}
      empty={{
        title:
          kind === "new"
            ? t("ui.noNewBacklinksThisWeek")
            : kind === "lost"
              ? t("ui.noLostBacklinksFound")
              : t("ui.noActiveBacklinksFoundYet"),
      }}
      columns={columns}
      filters={[
        { id: "urlFrom", label: t("ui.referringPage"), kind: "text" },
        { id: "anchor", label: t("ui.anchorText"), kind: "text" },
        { id: "urlTo", label: t("ui.targetPage"), kind: "text" },
        { id: "follow", label: t("ui.linkType"), kind: "follow" },
        { id: "domainFromRank", label: t("ui.domainRank"), kind: "number" },
        { id: "spamScore", label: t("ui.spamScore"), kind: "number" },
      ]}
    />
  );
}
