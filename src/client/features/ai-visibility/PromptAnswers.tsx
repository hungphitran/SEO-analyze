import type { ReactNode } from "react";
import {
  AI_ENGINE_LABELS,
  aiObservationStatusLabel,
  type AiObservationRow,
  type AiPrompt,
} from "@/shared/ai-visibility";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { AnswerContent } from "./AnswerContent";
import { t } from "@/shared/i18n";

export function PromptAnswers({
  projectId,
  prompt,
  observation,
  controls,
}: {
  projectId: string;
  prompt: AiPrompt | undefined;
  observation: AiObservationRow;
  /** Chooses which answer is shown. */
  controls: ReactNode;
}) {
  return (
    <section
      className="overflow-hidden rounded-lg border bg-card border-border"
      aria-label={t("ai.selectedExecutionAnswer")}
    >
      <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3 border-border">
        <h2 className="mr-auto text-sm font-semibold">{t("ai.answer")}</h2>
        {controls}
      </div>
      {prompt && observation.prompt !== prompt.text && (
        <p
          className="border-b px-5 py-3 text-xs text-muted-foreground border-border"
          data-ph-mask
        >
          {t("ui.collectedPrompt", { v0: observation.prompt })}
        </p>
      )}
      {observation.status === "completed" ? (
        <AnswerContent
          key={observation.id}
          projectId={projectId}
          observationId={observation.id}
        />
      ) : (
        <div className="space-y-2 p-6">
          <p className="text-sm font-medium">
            {AI_ENGINE_LABELS[observation.engine]} ·{" "}
            {aiObservationStatusLabel(observation.status)}
          </p>
          <p className="text-sm text-muted-foreground">
            {observation.error
              ? getStandardErrorMessage(new Error(observation.error))
              : t("ai.answerNotYet")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("ui.thisCollectionIsExcludedFromVisibility")}
          </p>
        </div>
      )}
    </section>
  );
}
