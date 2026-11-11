import { CalendarDays, SlidersHorizontal, Table } from "lucide-react";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";
import { ExportMenu } from "@/client/components/ExportMenu";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Progress } from "@/client/components/ui/progress";
import { Spinner } from "@/client/components/ui/spinner";
import { MoreMenu } from "./ToolbarMenus";
import { t } from "@/shared/i18n";

export function RankTrackingTableToolbar({
  showFilters,
  onToggleFilters,
  activeFilterCount,
  isRunning,
  latestRun,
  keywordCount,
  viewMode,
  onViewModeChange,
  historyAvailable,
  onExport,
  onCheckNow,
  onRefreshMetrics,
  metricsRefreshing,
  trackedKeywordCount,
  checkBusy,
  checkDisabled,
  hasData,
}: {
  showFilters: boolean;
  onToggleFilters: () => void;
  activeFilterCount: number;
  isRunning: boolean;
  latestRun:
    | { status: string; keywordsChecked: number; keywordsTotal: number }
    | null
    | undefined;
  keywordCount: number;
  viewMode: "table" | "history";
  onViewModeChange: (v: "table" | "history") => void;
  historyAvailable: boolean;
  onExport: (action: "sheets" | "csv" | "copy-list") => void;
  onCheckNow: () => void;
  onRefreshMetrics: () => void;
  metricsRefreshing: boolean;
  trackedKeywordCount: number;
  checkBusy: boolean;
  checkDisabled: boolean;
  hasData: boolean;
}) {
  return (
    <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 border-y border-border">
      {/* History needs at least two checks to compare; until then the toggle
          would only offer a worse copy of the Latest table. */}
      {historyAvailable && (
        <SegmentedToggle
          showLabels
          items={[
            {
              value: "table" as const,
              icon: <Table className="size-3.5" />,
              label: t("common.latest"),
            },
            {
              value: "history" as const,
              icon: <CalendarDays className="size-3.5" />,
              label: t("common.history"),
            },
          ]}
          value={viewMode}
          onChange={onViewModeChange}
        />
      )}

      <Button
        variant="outline"
        size="sm"
        aria-pressed={showFilters}
        className="aria-pressed:bg-muted aria-pressed:text-foreground"
        onClick={onToggleFilters}
        title={t("rank.toggleFilters")}
      >
        <SlidersHorizontal data-icon="inline-start" />
        {t("ui.filters")}
        {activeFilterCount > 0 && <Badge size="sm">{activeFilterCount}</Badge>}
      </Button>

      {isRunning && latestRun ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-3.5 text-primary" />
          <span>
            {latestRun.status === "pending"
              ? t("common.preparing")
              : t("ui.gettingRankingsForKeyword", { v0: latestRun.keywordsTotal || "?" })}{" "}
            {latestRun.keywordsChecked}/{latestRun.keywordsTotal || "?"}
          </span>
          {latestRun.keywordsTotal > 0 && (
            <Progress
              className="w-24"
              aria-label={t("rank.checkProgress")}
              value={latestRun.keywordsChecked}
              max={latestRun.keywordsTotal}
            />
          )}
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">{t("ui.keywords_1c59", { v0: keywordCount })}</span>
      )}

      <div className="flex-1" />

      <ExportMenu
        actions={["sheets", "csv", "copy-list"]}
        copyListLabel={t("saved.copyKeywords")}
        onExport={onExport}
        disabled={!hasData}
      />

      {/* Both actions need a paid plan; free users get the page's upgrade
          alert instead of a menu whose items fail. */}
      {!checkDisabled && (
        <MoreMenu
          onCheckNow={onCheckNow}
          checkBusy={checkBusy}
          onRefreshMetrics={onRefreshMetrics}
          metricsRefreshing={metricsRefreshing}
          trackedKeywordCount={trackedKeywordCount}
          hasData={hasData}
        />
      )}
    </div>
  );
}
