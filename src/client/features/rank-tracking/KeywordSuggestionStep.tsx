import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { toast } from "sonner";
import { getDomainKeywordSuggestions } from "@/serverFunctions/domain";
import { addTrackingKeywords } from "@/serverFunctions/rank-tracking";
import { isLabsLocationCode } from "@/client/features/keywords/locations";
import { Spinner } from "@/client/components/Spinner";
import {
  DataTable,
  makeSelectionColumn,
  useDataTable,
} from "@/client/components/table/DataTable";
import { Button } from "@/client/components/ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import { RANK_TRACKING_HEADER_CLASS } from "./RankTrackingColumns";
import {
  applyShiftRangeSelection,
  type SelectionAnchor,
} from "@/client/components/table/tableSelection";
import { t } from "@/shared/i18n";

type SuggestedKeyword = {
  keyword: string;
  position: number | null;
  searchVolume: number | null;
  traffic: number | null;
};

const PRE_SELECT_COUNT = 20;

const baseColumns: ColumnDef<SuggestedKeyword>[] = [
  {
    id: "keyword",
    accessorKey: "keyword",
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label={t("common.keyword")}
        title={t("rank.searchTermHelp")}
        className={RANK_TRACKING_HEADER_CLASS}
      />
    ),
    cell: ({ getValue }) => (
      <span className="font-medium">{getValue<string>()}</span>
    ),
    sortingFn: "alphanumeric",
  },
  {
    id: "position",
    accessorKey: "position",
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label={t("rank.position")}
        title={t("rank.currentPositionHelp")}
        className={RANK_TRACKING_HEADER_CLASS}
      />
    ),
    cell: ({ getValue }) => {
      const pos = getValue<number | null>();
      return pos != null ? (
        pos
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
    sortingFn: (rowA, rowB) => {
      const a = rowA.original.position ?? 999;
      const b = rowB.original.position ?? 999;
      return a - b;
    },
  },
  {
    id: "searchVolume",
    accessorKey: "searchVolume",
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label={t("kw.volume")}
        title={t("rank.monthlyVolume")}
        className={RANK_TRACKING_HEADER_CLASS}
      />
    ),
    cell: ({ getValue }) => {
      const vol = getValue<number | null>();
      return vol != null ? (
        vol.toLocaleString()
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
    sortingFn: (rowA, rowB) => {
      const a = rowA.original.searchVolume ?? 0;
      const b = rowB.original.searchVolume ?? 0;
      return a - b;
    },
  },
  {
    id: "traffic",
    accessorKey: "traffic",
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label={t("metrics.traffic")}
        title={t("rank.monthlyTraffic")}
        className={RANK_TRACKING_HEADER_CLASS}
      />
    ),
    cell: ({ getValue }) => {
      const traffic = getValue<number | null>();
      return traffic != null ? (
        Math.round(traffic).toLocaleString()
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
    sortingFn: (rowA, rowB) => {
      const a = rowA.original.traffic ?? 0;
      const b = rowB.original.traffic ?? 0;
      return a - b;
    },
  },
];

type Props = {
  configId: string;
  projectId: string;
  domain: string;
  locationCode: number;
  onDone: (configId: string) => void;
  onClose: () => void;
};

export function KeywordSuggestionStep({
  configId,
  projectId,
  domain,
  locationCode,
  onDone,
  onClose,
}: Props) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [hasInitialized, setHasInitialized] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "traffic", desc: true },
  ]);
  const selectAnchorRef = useRef<SelectionAnchor | null>(null);

  const columns = useMemo<ColumnDef<SuggestedKeyword>[]>(
    () => [
      makeSelectionColumn<SuggestedKeyword>(selectAnchorRef),
      ...baseColumns,
    ],
    [],
  );

  // Ranked-keyword suggestions are Labs-backed; countries served from Google
  // Ads keyword data (e.g. Iceland) have no ranking data to suggest from.
  // The tracker's language is deliberately not sent — rank tracking can pair
  // any SERP language with any country, and the server resolves a Labs-served
  // language for this country (resolveLabsMarket in serverFunctions/domain.ts).
  const labsSupported = isLabsLocationCode(locationCode);
  const suggestionsQuery = useQuery({
    queryKey: ["domainKeywordSuggestions", projectId, domain, locationCode],
    queryFn: () =>
      getDomainKeywordSuggestions({
        data: { projectId, domain, locationCode },
      }),
    enabled: labsSupported,
  });

  const data = suggestionsQuery.data ?? [];

  // Pre-select top 20 by traffic once data loads.
  useEffect(() => {
    const items = suggestionsQuery.data;
    if (items && items.length > 0 && !hasInitialized) {
      const indexed = items.map((item, i) => ({
        index: i,
        traffic: item.traffic ?? 0,
      }));
      indexed.sort((a, b) => b.traffic - a.traffic);
      const initial: RowSelectionState = {};
      for (let i = 0; i < Math.min(PRE_SELECT_COUNT, indexed.length); i++) {
        initial[indexed[i].index] = true;
      }
      setRowSelection(initial);
      setHasInitialized(true);
    }
  }, [suggestionsQuery.data, hasInitialized]);

  const table = useDataTable({
    data,
    columns,
    state: { rowSelection, sorting },
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    withSorting: true,
    enableRowSelection: true,
  });

  const selectedCount = Object.keys(rowSelection).filter(
    (k) => rowSelection[k],
  ).length;

  const addMutation = useMutation({
    mutationFn: (keywords: string[]) =>
      addTrackingKeywords({ data: { projectId, configId, keywords } }),
    onSuccess: (result) => {
      toast.success(t("ui.addedKeywordsForTracking", { v0: result.added }));
      onDone(configId);
    },
  });

  const handleAdd = () => {
    const selectedKeywords = table
      .getSelectedRowModel()
      .rows.map((row) => row.original.keyword);
    if (selectedKeywords.length > 0) {
      addMutation.mutate(selectedKeywords);
    }
  };

  if (!labsSupported) {
    return (
      <>
        <StepHeader
          title={t("rank.addManually")}
          description={t("rank.noSuggestionsCountry")}
        />
        <DialogFooter>
          <Button onClick={onClose}>{t("common.continue")}</Button>
        </DialogFooter>
      </>
    );
  }

  if (suggestionsQuery.isLoading) {
    return (
      <>
        <StepHeader title={t("rank.findingTop")} />
        <div className="flex flex-col items-center justify-center py-16">
          <Spinner label={t("rank.usuallySeconds")} />
        </div>
      </>
    );
  }

  if (suggestionsQuery.isError) {
    return (
      <>
        <StepHeader
          title={t("rank.couldNotFetchKeywords")}
          description={t("rank.skipAddLater")}
        />
        <DialogFooter>
          <Button onClick={onClose}>{t("common.skip")}</Button>
        </DialogFooter>
      </>
    );
  }

  if (data.length === 0) {
    return (
      <>
        <StepHeader
          title={t("rank.noRankingsFound")}
          description={t("ui.weCouldnTFindAnyKeywords", { v0: domain })}
        />
        <DialogFooter>
          <Button onClick={onClose}>{t("common.skip")}</Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <StepHeader
        title={t("rank.chooseKeywords")}
        description={t("ui.weFoundKeywordsRanksFor", {
          v0: data.length,
          v1: domain,
        })}
      />

      <DataTable
        table={table}
        empty={{ title: t("kw.noKeywords") }}
        scrollClassName="max-h-[400px]"
        onRowClick={(row, event) => {
          if (applyShiftRangeSelection(event, row, table, selectAnchorRef)) {
            return;
          }
          row.toggleSelected();
        }}
      />

      <DialogFooter className="items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {t("ui.ofSelected", { v0: selectedCount, v1: data.length })}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("ui.skip")}
          </Button>
          <Button
            onClick={handleAdd}
            pending={addMutation.isPending}
            disabled={selectedCount === 0}
          >
            {t("ui.saveKeyword")}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

function StepHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
      {description ? (
        <DialogDescription>{description}</DialogDescription>
      ) : null}
    </DialogHeader>
  );
}
