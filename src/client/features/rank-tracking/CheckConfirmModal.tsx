import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";
import {
  devicesCount,
  KEYWORDS_PER_BATCH,
  SECONDS_PER_BATCH,
} from "@/shared/rank-tracking";
import { t } from "@/shared/i18n";

export function CheckConfirmModal({
  keywordCount,
  devices,
  costUsd,
  isPending,
  onRunNow,
  onCancel,
}: {
  keywordCount: number;
  devices: RankTrackingConfig["devices"];
  /** Server estimate; it prices each keyword's text (operators cost 5x). */
  costUsd: number | undefined;
  isPending: boolean;
  onRunNow: () => void;
  onCancel: () => void;
}) {
  const dc = devicesCount(devices);
  const totalChecks = keywordCount * dc;
  const liveTime =
    Math.ceil(totalChecks / KEYWORDS_PER_BATCH) * SECONDS_PER_BATCH;

  const eta =
    liveTime < 60 ? `${liveTime}s` : t("ui.min_6d5c", { v0: Math.ceil(liveTime / 60) });

  return (
    <ConfirmDialog
      title={t("ui.checkKeyword", { v0: keywordCount })}
      confirmLabel={t("rank.runNow")}
      pending={isPending}
      onConfirm={onRunNow}
      onClose={onCancel}
    >
      {t("ui.rankCheckEstimate", {
        keywords: keywordCount,
        devices: dc,
        checks: totalChecks,
        eta,
      })}
      {costUsd != null ? (
        <>
          {" "}
          {t("ui.costsUpToLabel")}{" "}
          <span className="font-mono font-semibold text-foreground">
            ${costUsd.toFixed(2)}
          </span>
          .
        </>
      ) : null}
    </ConfirmDialog>
  );
}
