import { Info } from "lucide-react";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { t } from "@/shared/i18n";

export function RankTrackingChangesAlert() {
  return (
    <Alert variant="info">
      <Info />
      <AlertDescription className="text-foreground">
        <p>
          <span className="font-medium">
            {t("ui.rankTrackingNowRetriesSomeResults")}
          </span>{" "}
          {t("ui.sinceSeptemberGoogleHasBeenServing")}{" "}
          <a
            href="https://openseo.so/blogs/rank-tracking-changes"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-4"
          >
            {t("ui.readWhatChanged")}
          </a>
        </p>
      </AlertDescription>
    </Alert>
  );
}
