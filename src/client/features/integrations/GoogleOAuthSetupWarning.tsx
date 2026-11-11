import { AlertTriangle, Info } from "lucide-react";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/client/components/ui/alert";
import { isEveryAppClientAuthMode } from "@/lib/auth-mode";
import { t } from "@/shared/i18n";

const EVERY_APP_GOOGLE_SETUP_URL =
  "https://everyapp.com/docs/providers/google#connect-accounts";

export function GoogleOAuthSetupWarning({
  integrationName,
  docsUrl,
}: {
  integrationName: string;
  docsUrl: string;
}) {
  if (isEveryAppClientAuthMode()) {
    // Google connects through the gateway, which holds the Google client;
    // OpenSEO holds none here (server/features/google/googleAccess.ts).
    return (
      <Alert variant="info">
        <Info className="size-4" />
        <AlertTitle>{t("integrations.everyAppGoogleTitle")}</AlertTitle>
        <AlertDescription>
          <p>
            {t("integrations.everyAppGoogleBody", {
              redirect:
                "https://<your gateway>/connect/google-workspace/callback",
              command:
                "pnpm everyapp secret set GOOGLE_WORKSPACE_CLIENT_ID GOOGLE_WORKSPACE_CLIENT_SECRET",
              name: integrationName,
            })}
          </p>
          <SafeExternalLink
            url={EVERY_APP_GOOGLE_SETUP_URL}
            label={t("integrations.howToAddProvider")}
            className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
          />
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="warning">
      <AlertTriangle className="size-4" />
      <AlertTitle>{t("integrations.oauthNotConfiguredTitle")}</AlertTitle>
      <AlertDescription>
        <p>
          {t("integrations.oauthNotConfiguredBody", { name: integrationName })}
        </p>
        <SafeExternalLink
          url={docsUrl}
          label={t("integrations.openSetupGuide")}
          className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
        />
      </AlertDescription>
    </Alert>
  );
}
