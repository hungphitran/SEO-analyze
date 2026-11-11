import { Link } from "@tanstack/react-router";
import { ShieldAlert, Wrench } from "lucide-react";
import { GateCard } from "@/client/components/GateCard";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { isEveryAppClientAuthMode } from "@/lib/auth-mode";
import { t } from "@/shared/i18n";

export function SamSetupGate({
  errorMessage,
  isRefetching,
  onRetry,
}: {
  errorMessage: string | null;
  isRefetching: boolean;
  onRetry: () => void;
}) {
  return (
    <GateCard
      icon={Wrench}
      tone="warning"
      title={t("sam.enableAi")}
      description={
        <>
          {isEveryAppClientAuthMode() ? (
            <p>
              {t("ui.samOpenseoSInAppAi")}{" "}
              <code>pnpm everyapp secret set OPENROUTER_API_KEY</code>{t("ui.thenConfirmHere")}
            </p>
          ) : (
            <p>
              {t("ui.samOpenseoSInAppAi_ebf2")}{" "}
              <code>OPENROUTER_API_KEY</code> {t("ui.environmentVariableRestartOpenseoThenConfirm")}
            </p>
          )}
          <p className="text-xs">
            {t("ui.stepByStepInstructionsForEvery")}{" "}
            <Link
              className="underline underline-offset-2 hover:text-foreground"
              to="/help/openrouter-api-key"
            >
              {t("ui.openrouterApiKeySetupGuide")}
            </Link>
            .
          </p>
        </>
      }
      actions={
        <>
          <Button size="lg" pending={isRefetching} onClick={onRetry}>
            {t("ui.confirmApiKey")}
          </Button>
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            render={
              <a
                href="https://openrouter.ai/settings/keys"
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            {t("ui.openOpenrouterKeys")}
          </Button>
        </>
      }
    >
      {errorMessage ? (
        <Alert variant="warning">
          <ShieldAlert />
          <AlertDescription className="text-foreground">
            {errorMessage}
          </AlertDescription>
        </Alert>
      ) : null}
    </GateCard>
  );
}
