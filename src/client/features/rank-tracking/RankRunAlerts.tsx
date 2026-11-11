import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { InsufficientCreditsError } from "@/client/features/billing/InsufficientCreditsError";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import type { useRankRunPolling } from "./useRankRunPolling";
import { t } from "@/shared/i18n";

/** Warnings about the latest rank check: stale, failed, or incomplete. */
export function RankRunAlerts({
  run,
}: {
  run: ReturnType<typeof useRankRunPolling>;
}) {
  if (!run) return null;

  if (run.maybeStale) {
    return (
      <Alert variant="warning">
        <AlertTriangle />
        <AlertDescription className="text-foreground">
          {t("ui.thisRunMayBeUnresponsiveAnd")}
        </AlertDescription>
      </Alert>
    );
  }

  if (run.status === "failed" && run.errorMessage === "INSUFFICIENT_CREDITS") {
    return <InsufficientCreditsError title={t("rank.lastCheckDidNotRun")} />;
  }

  if (run.status === "failed") {
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertDescription className="text-foreground">
          <p>
            <span className="font-medium">{t("rank.lastCheckFailed")}</span>{" "}
            {run.errorMessage &&
              getStandardErrorMessage(new Error(run.errorMessage))}
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  // A completed run only has an error message when some checks failed.
  if (run.status === "completed" && run.errorMessage) {
    return (
      <Alert variant="warning">
        <AlertTriangle />
        <AlertDescription className="text-foreground">
          <p>
            <span className="font-medium">{t("rank.lastCheckIncomplete")}</span>{" "}
            {t("ui.ourSearchDataProviderHadErrors")}
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
