import { Monitor, Plus, Settings, Smartphone } from "lucide-react";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";
import { Button } from "@/client/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/client/components/ui/tooltip";
import { getLocationDisplayName } from "@/shared/keyword-locations";
import { devicesLabel, scheduleLabel } from "@/shared/rank-tracking";
import { formatNextCheck } from "./scheduleTime";
import { formatLocationLabel } from "@/shared/keyword-locations";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";
import {
  comparePeriodSchema,
  type ComparePeriod,
} from "@/types/schemas/rank-tracking-search";
import { t } from "@/shared/i18n";

const COMPARE_ITEMS: { value: ComparePeriod; label: string }[] = [
  { value: "1d", label: t("ui.vsYesterday") },
  { value: "7d", label: t("ui.vsLastWeek") },
  { value: "30d", label: t("ui.vsLastMonth") },
  { value: "90d", label: t("ui.vs90DaysAgo") },
];

export function RankTrackingDetailHeader({
  config,
  sourceProvider,
  run,
  costEstimate,
  hasBothDevices,
  activeDevice,
  onActiveDeviceChange,
  comparePeriod,
  onComparePeriodChange,
  onEdit,
  onToggleAddKeywords,
}: {
  config: RankTrackingConfig;
  sourceProvider: "dataforseo" | "openserp" | null | undefined;
  run:
    | {
        lastCheckedAt: string | null;
        sourceProvider: "dataforseo" | "openserp" | null;
      }
    | null
    | undefined;
  costEstimate:
    | {
        keywordCount: number;
        costUsd: number;
        sourceProvider: "dataforseo" | "openserp";
      }
    | undefined;
  hasBothDevices: boolean;
  activeDevice: "desktop" | "mobile";
  onActiveDeviceChange: (v: "desktop" | "mobile") => void;
  comparePeriod: ComparePeriod;
  onComparePeriodChange: (v: ComparePeriod) => void;
  onEdit: () => void;
  onToggleAddKeywords: () => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 px-4 pt-4 pb-3">
      <div>
        <h2 className="text-lg font-semibold">{config.domain}</h2>
        <p className="text-xs text-muted-foreground">
          {config.locationName
            ? formatLocationLabel(config.locationName, 2)
            : (getLocationDisplayName(config.locationCode) ?? "US")}{" "}
          &middot;{" "}
          {(sourceProvider ?? run?.sourceProvider) === "openserp" ? (
            t("rank.deviceIndependent")
          ) : config.devices === "desktop" ? (
            devicesLabel(config.devices)
          ) : (
            <Tooltip>
              <TooltipTrigger
                delay={150}
                render={
                  <span className="cursor-help underline decoration-dotted underline-offset-2" />
                }
              >
                {devicesLabel(config.devices)}
              </TooltipTrigger>
              <TooltipContent>
                {t("ui.mobileResultsOftenDifferFromDesktop")}
              </TooltipContent>
            </Tooltip>
          )}{" "}
          &middot; {scheduleLabel(config.scheduleInterval)}
          {config.scheduleInterval !== "manual" && config.nextCheckAt && (
            <>{t("ui.next", { v0: formatNextCheck(config.nextCheckAt) })}</>
          )}
          {run?.lastCheckedAt && (
            <>
              {t("ui.last_a875", {
                v0: new Date(run.lastCheckedAt).toLocaleDateString(),
              })}
            </>
          )}
          {costEstimate?.sourceProvider === "dataforseo" &&
            costEstimate.keywordCount > 0 && (
              <>{t("ui.upToCheck", { v0: costEstimate.costUsd.toFixed(2) })}</>
            )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {hasBothDevices && (
          <SegmentedToggle
            items={[
              {
                value: "desktop" as const,
                icon: <Monitor className="size-3.5" />,
                label: t("common.desktop"),
              },
              {
                value: "mobile" as const,
                icon: <Smartphone className="size-3.5" />,
                label: t("common.mobile"),
              },
            ]}
            value={activeDevice}
            onChange={onActiveDeviceChange}
          />
        )}
        <Select
          items={COMPARE_ITEMS}
          value={comparePeriod}
          onValueChange={(value) => {
            const parsed = comparePeriodSchema.safeParse(value);
            if (parsed.success) onComparePeriodChange(parsed.data);
          }}
        >
          <SelectTrigger
            size="sm"
            aria-label={t("rank.comparisonPeriod")}
            title={t("rank.comparisonPeriod")}
            className="text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMPARE_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="hidden h-6 w-px bg-border sm:block" />
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Settings data-icon="inline-start" />
          {t("ui.configure")}
        </Button>
        <Button size="sm" onClick={onToggleAddKeywords}>
          <Plus data-icon="inline-start" />
          {t("ui.addKeywords")}
        </Button>
      </div>
    </div>
  );
}
