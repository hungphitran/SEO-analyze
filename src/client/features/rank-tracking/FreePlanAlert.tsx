import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { SUBSCRIBE_ROUTE } from "@/shared/billing";
import { t } from "@/shared/i18n";

export function FreePlanAlert({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <Alert variant="warning">
      <AlertTriangle />
      <AlertDescription className="text-foreground">
        <p>
          {t("ui.weOnlyStartToTrackKeyword")}{" "}
          <Link
            to={SUBSCRIBE_ROUTE}
            search={{ upgrade: true }}
            className="font-medium underline underline-offset-3"
          >
            {t("ui.upgradeToThePaidPlan")}
          </Link>
          .
        </p>
      </AlertDescription>
    </Alert>
  );
}
