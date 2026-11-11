import { Loader2 } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { DialogFooter } from "@/client/components/ui/dialog";
import { aiCountryLabel, type AiCostEstimate } from "@/shared/ai-visibility";
import {
  getLanguageDisplayName,
  getLocationDisplayName,
} from "@/shared/keyword-locations";
import { scheduleLabel } from "@/shared/rank-tracking";
import { EngineLabel } from "./EngineLabel";
import type { AiTrackerPatch } from "@/types/schemas/ai-visibility";
import { AiQueryError, aiMoney } from "./shared";
import { t } from "@/shared/i18n";

export type TrackerSetupReviewData = {
  patch: AiTrackerPatch;
  estimate: AiCostEstimate;
};

export function TrackerSetupReview({
  review,
  enabled,
  creating,
  pending,
  error,
  canSchedule,
  scheduling,
  onBack,
  onSave,
  onSaveAndSchedule,
}: {
  review: TrackerSetupReviewData;
  enabled: boolean;
  /** No tracker yet; saving creates one on the weekly schedule. */
  creating: boolean;
  pending: boolean;
  error: unknown;
  canSchedule: boolean;
  scheduling: boolean;
  onBack: () => void;
  onSave: () => void;
  onSaveAndSchedule: () => void;
}) {
  const paused = !enabled && !creating;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("ui.reviewYourChangesBeforeSaving", { v0: enabled
          ? t("ai.settingsApplySchedule")
          : creating
            ? t("ai.weeklyFirstWeek")
            : t("ai.trackWeeklyHelp") })}</p>
      <dl className="grid grid-cols-2 gap-4 rounded-lg border p-4 text-sm border-border">
        {review.patch.engines && (
          <div>
            <dt className="text-muted-foreground">{t("ai.engines")}</dt>
            <dd className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {review.patch.engines?.map((engine) => (
                <EngineLabel key={engine} engine={engine} />
              ))}
            </dd>
          </div>
        )}
        {review.patch.prompts !== undefined && (
          <div>
            <dt className="text-muted-foreground">{t("ai.newPrompts")}</dt>
            <dd className="mt-1">{review.patch.prompts?.length ?? 0}</dd>
          </div>
        )}
        {review.patch.prompts?.[0]?.topic && (
          <div>
            <dt className="text-muted-foreground">{t("ai.topic")}</dt>
            <dd className="mt-1">{review.patch.prompts[0].topic}</dd>
          </div>
        )}
        {review.patch.locationCode && review.patch.languageCode && (
          <div>
            <dt className="text-muted-foreground">{t("ai.market")}</dt>
            <dd className="mt-1">
              {`${
                getLocationDisplayName(review.patch.locationCode) ??
                aiCountryLabel(review.patch.locationCode)
              } · ${getLanguageDisplayName(review.patch.languageCode)}`}
            </dd>
          </div>
        )}
      </dl>
      {!!review.patch.prompts?.length && (
        <div
          className="max-h-56 space-y-2 overflow-y-auto rounded-lg border p-4 border-border"
          data-ph-mask
        >
          <h3 className="text-sm font-semibold">{t("ai.promptsToAdd")}</h3>
          {review.patch.prompts.map((prompt) => (
            <p
              key={prompt.text}
              className="whitespace-pre-wrap text-[0.8125rem] leading-relaxed"
            >
              {prompt.text}
            </p>
          ))}
        </div>
      )}
      <div className="space-y-1 rounded-lg bg-muted/60 p-4 text-sm">
        <p>
          {t("ui.eachRunCollects")} <strong>{review.estimate.observations}</strong>{" "}
          {t("ui.answersFor")}{" "}
          <strong>{aiMoney(review.estimate.costUsd)}</strong>
        </p>
        <p>
          <strong>{aiMoney(review.estimate.monthlyCostUsd)}</strong> {t("ui.estimatedPerMonthIfItRuns")}{" "}
          {scheduleLabel(review.estimate.scheduleInterval).toLowerCase()}.
        </p>
      </div>
      {!!error && <AiQueryError error={error} />}
      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={onBack}
        >
          {t("ui.backToEditing")}
        </Button>
        <Button
          type="button"
          variant={paused ? "secondary" : "default"}
          disabled={pending}
          onClick={onSave}
        >
          {pending && !scheduling && (
            <Loader2 className="size-4 animate-spin" />
          )}
          {enabled
            ? t("ai.saveReviewed")
            : creating
              ? t("ai.saveTrackWeekly")
              : t("ai.savePaused")}
        </Button>
        {paused && (
          <Button
            type="button"
            disabled={
              pending || !canSchedule || review.estimate.observations === 0
            }
            onClick={onSaveAndSchedule}
          >
            {pending && scheduling && (
              <Loader2 className="size-4 animate-spin" />
            )}
            {t("ui.saveAndTrackWeekly")}
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}
