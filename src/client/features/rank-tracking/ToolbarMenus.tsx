import { useFreeSourcesOnly } from "@/client/lib/free-sources-mode";
import { useState } from "react";
import { MoreHorizontal, Play, RefreshCw } from "lucide-react";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { Button } from "@/client/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import { t } from "@/shared/i18n";

function ItemText({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <span className="flex flex-col">
      <span>{label}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </span>
  );
}

export function MoreMenu({
  onCheckNow,
  checkBusy,
  onRefreshMetrics,
  metricsRefreshing,
  trackedKeywordCount,
  hasData,
}: {
  onCheckNow: () => void;
  checkBusy: boolean;
  onRefreshMetrics: () => void;
  metricsRefreshing: boolean;
  trackedKeywordCount: number;
  hasData: boolean;
}) {
  const [confirmingRefresh, setConfirmingRefresh] = useState(false);
  // Keyword stats (volume/KD/CPC) are DataForSEO-only: no action without them.
  const freeSourcesOnly = useFreeSourcesOnly();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("rank.moreActions")}
              title={t("rank.moreActions")}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onClick={onCheckNow} disabled={checkBusy}>
            <Play />
            <ItemText
              label={checkBusy ? t("common.running") : t("rank.checkRankings")}
              description={t("rank.fetchPositions")}
            />
          </DropdownMenuItem>
          {freeSourcesOnly ? null : (
          <DropdownMenuItem
            onClick={() => setConfirmingRefresh(true)}
            disabled={metricsRefreshing || !hasData}
          >
            <RefreshCw className={metricsRefreshing ? "animate-spin" : ""} />
            <ItemText
              label={
                metricsRefreshing ? t("common.refreshingDots") : t("saved.updateKeywordStats")
              }
              description={t("rank.statsNotRankings")}
            />
          </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {confirmingRefresh && !freeSourcesOnly ? (
        <ConfirmDialog
          title={t("saved.updateStatsTitle")}
          confirmLabel={t("saved.updateStats")}
          onConfirm={() => {
            setConfirmingRefresh(false);
            onRefreshMetrics();
          }}
          onClose={() => setConfirmingRefresh(false)}
        >
          {t("rank.refreshStatsBody", { count: trackedKeywordCount })}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
