import { useMemo, type MutableRefObject } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Star } from "lucide-react";
import { makeSelectionColumn } from "@/client/components/table/DataTable";
import { ScoreBadge } from "@/client/components/table/ScoreBadge";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import type { RankTrackingRow } from "@/types/schemas/rank-tracking";
import { formatLocationLabel } from "@/shared/keyword-locations";
import {
  CpcCell,
  DeviceRankCell,
  DeviceUrlCell,
  SerpFeatureTags,
  VolumeCell,
} from "./RankTrackingTableParts";
import type { SelectionAnchor } from "@/client/components/table/tableSelection";
import { t } from "@/shared/i18n";
import { useFreeSourcesOnly } from "@/client/lib/free-sources-mode";

export const RANK_TRACKING_HEADER_CLASS =
  "text-xs uppercase tracking-wide text-muted-foreground";

const HEADER_TOOLTIPS: Record<string, string> = {
  keyword: t("rank.trackedTermHelp"),
  volume: t("rank.volumeFromGoogle"),
  kd: t("rank.kdHelp"),
  cpc: t("rank.cpcAvgHelp"),
  desktopPosition: t("rank.positionChangeHelp"),
  mobilePosition: t("rank.positionChangeHelp"),
  url: t("rank.rankingPageHelp"),
  serp: t("rank.serpFeaturesHelp"),
};

// Local configs fetch volume scoped to the tracked city, so the header must
// say which number the user is looking at — national volume can overstate
// local demand by orders of magnitude.
function makeVolumeColumn(locationLabel?: string): ColumnDef<RankTrackingRow> {
  return {
    id: "volume",
    accessorFn: (row) => row.searchVolume ?? undefined,
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label={locationLabel ? t("rank.localVolume") : t("kw.volume")}
        title={
          locationLabel
            ? t("rank.estimatedSearchesIn", { location: locationLabel })
            : HEADER_TOOLTIPS.volume
        }
        className={RANK_TRACKING_HEADER_CLASS}
      />
    ),
    size: 90,
    cell: ({ getValue }) => (
      <VolumeCell value={getValue<number | undefined>() ?? null} />
    ),
    sortUndefined: "last",
  };
}

const kdColumn: ColumnDef<RankTrackingRow> = {
  id: "kd",
  accessorFn: (row) => row.keywordDifficulty ?? undefined,
  header: ({ column }) => (
    <SortableHeader
      column={column}
      label="KD"
      title={HEADER_TOOLTIPS.kd}
      className={RANK_TRACKING_HEADER_CLASS}
    />
  ),
  size: 70,
  cell: ({ getValue }) => (
    <ScoreBadge value={getValue<number | undefined>() ?? null} />
  ),
  sortUndefined: "last",
};

const cpcColumn: ColumnDef<RankTrackingRow> = {
  id: "cpc",
  accessorFn: (row) => row.cpc ?? undefined,
  header: ({ column }) => (
    <SortableHeader
      column={column}
      label="CPC"
      title={HEADER_TOOLTIPS.cpc}
      className={RANK_TRACKING_HEADER_CLASS}
    />
  ),
  size: 80,
  cell: ({ getValue }) => (
    <CpcCell value={getValue<number | undefined>() ?? null} />
  ),
  sortUndefined: "last",
};

// Hidden column. The table always sorts by it first, so pinned keywords stay
// on top and each group keeps the sort the user picked.
export const PINNED_COLUMN_ID = "pinned";

const pinnedColumn: ColumnDef<RankTrackingRow> = {
  id: PINNED_COLUMN_ID,
  accessorFn: (row) => (row.pinned ? 0 : 1),
};

function makeKeywordColumn(
  onKeywordClick: (row: RankTrackingRow) => void,
  onSetPinned: (vars: { trackingKeywordId: string; pinned: boolean }) => void,
): ColumnDef<RankTrackingRow> {
  return {
    id: "keyword",
    accessorKey: "keyword",
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label={t("common.keyword")}
        title={HEADER_TOOLTIPS.keyword}
        className={RANK_TRACKING_HEADER_CLASS}
      />
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-1.5">
        <PinButton
          pinned={row.original.pinned}
          onClick={() =>
            onSetPinned({
              trackingKeywordId: row.original.trackingKeywordId,
              pinned: !row.original.pinned,
            })
          }
        />
        <button
          type="button"
          className="text-left font-medium decoration-dotted underline-offset-2 hover:underline"
          onClick={() => onKeywordClick(row.original)}
          title={t("rank.viewHistory")}
        >
          {row.original.keyword}
        </button>
        {row.original.matchCase && (
          <Badge
            variant="secondary"
            size="sm"
            className="cursor-help"
            title={t("rank.exactCase")}
          >
            Aa
          </Badge>
        )}
      </div>
    ),
    sortingFn: "alphanumeric",
  };
}

function PinButton({
  pinned,
  onClick,
}: {
  pinned: boolean;
  onClick: () => void;
}) {
  const label = pinned ? t("rank.unpin") : t("rank.pin");
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pinned}
      title={label}
      className={
        pinned ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground"
      }
    >
      <Star className={pinned ? "fill-current" : undefined} />
    </Button>
  );
}

function makeDeviceColumn(
  device: "desktop" | "mobile",
): ColumnDef<RankTrackingRow> {
  const id = device === "desktop" ? "desktopPosition" : "mobilePosition";
  return {
    id,
    accessorFn: (row) => row[device].position ?? undefined,
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label={t("rank.position")}
        title={HEADER_TOOLTIPS[id]}
        className={RANK_TRACKING_HEADER_CLASS}
      />
    ),
    size: 120,
    maxSize: 140,
    cell: ({ row }) => <DeviceRankCell result={row.original[device]} />,
    sortUndefined: "last",
  };
}

function makeUrlColumn(
  device: "desktop" | "mobile",
  domain: string,
): ColumnDef<RankTrackingRow> {
  return {
    id: device === "desktop" ? "desktopUrl" : "mobileUrl",
    enableSorting: false,
    header: () => (
      <span
        className="cursor-help text-xs font-medium tracking-wide uppercase text-muted-foreground"
        title={HEADER_TOOLTIPS.url}
      >
        URL
      </span>
    ),
    size: 240,
    cell: ({ row }) => (
      <DeviceUrlCell result={row.original[device]} domain={domain} />
    ),
  };
}

function makeSerpColumn(
  device: "desktop" | "mobile",
): ColumnDef<RankTrackingRow> {
  return {
    id: device === "desktop" ? "desktopSerp" : "mobileSerp",
    enableSorting: false,
    header: () => (
      <span
        className="cursor-help text-xs font-medium tracking-wide uppercase text-muted-foreground"
        title={HEADER_TOOLTIPS.serp}
      >
        {t("ui.serpFeatures")}
      </span>
    ),
    cell: ({ row }) => {
      const features = row.original[device].serpFeatures;
      if (features.length === 0) return null;
      return <SerpFeatureTags features={features} />;
    },
  };
}

export function useRankTrackingColumns(options: {
  showDesktop: boolean;
  showMobile: boolean;
  domain: string;
  selectAnchorRef: MutableRefObject<SelectionAnchor | null>;
  onKeywordClick: (row: RankTrackingRow) => void;
  onSetPinned: (vars: { trackingKeywordId: string; pinned: boolean }) => void;
  locationName?: string | null;
}): ColumnDef<RankTrackingRow>[] {
  const {
    showDesktop,
    showMobile,
    domain,
    selectAnchorRef,
    onKeywordClick,
    onSetPinned,
    locationName,
  } = options;
  const locationLabel = locationName
    ? formatLocationLabel(locationName, 2)
    : undefined;
  // Volume, difficulty and CPC come from DataForSEO; free sources have none.
  const freeSourcesOnly = useFreeSourcesOnly();
  return useMemo(() => {
    const cols: ColumnDef<RankTrackingRow>[] = [
      pinnedColumn,
      makeSelectionColumn<RankTrackingRow>(selectAnchorRef),
      makeKeywordColumn(onKeywordClick, onSetPinned),
    ];
    if (showDesktop) {
      cols.push(makeDeviceColumn("desktop"));
      cols.push(makeUrlColumn("desktop", domain));
    }
    if (showMobile) {
      cols.push(makeDeviceColumn("mobile"));
      cols.push(makeUrlColumn("mobile", domain));
    }
    if (!freeSourcesOnly) {
      cols.push(makeVolumeColumn(locationLabel), kdColumn, cpcColumn);
    }
    if (showDesktop) {
      cols.push(makeSerpColumn("desktop"));
    }
    if (showMobile) {
      cols.push(makeSerpColumn("mobile"));
    }
    return cols;
  }, [
    showDesktop,
    showMobile,
    domain,
    selectAnchorRef,
    onKeywordClick,
    onSetPinned,
    locationLabel,
    freeSourcesOnly,
  ]);
}
