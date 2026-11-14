import { CalendarClock, Pause } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import type { AiTracker } from "@/shared/ai-visibility";
import { scheduleLabel } from "@/shared/rank-tracking";
import { aiDate } from "./shared";
import { t } from "@/shared/i18n";

/** The schedule section of Tracking settings. Changes go through a cost review. */
export function TrackingScheduleSummary({
  tracker,
  canSchedule,
  pausePending,
  onSchedule,
  onPause,
}: {
  tracker: AiTracker;
  canSchedule: boolean;
  pausePending: boolean;
  onSchedule: () => void;
  onPause: () => void;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{t("rank.schedule")}</h3>
      {tracker.enabled ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
          <p className="text-sm">
            {scheduleLabel(tracker.scheduleInterval)}
            <span className="text-muted-foreground">
              {t("ui.nextRun", { v0: aiDate(tracker.nextCheckAt) })}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pausePending}
              onClick={onPause}
            >
              <Pause />
              {t("ui.pause")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canSchedule}
              onClick={onSchedule}
            >
              <CalendarClock />
              {t("ui.changeSchedule")}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          disabled={!canSchedule}
          onClick={onSchedule}
        >
          <CalendarClock />
          {t("ui.scheduleTracking")}
        </Button>
      )}
    </section>
  );
}
