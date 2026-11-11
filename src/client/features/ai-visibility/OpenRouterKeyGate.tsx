import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { GateCard } from "@/client/components/GateCard";
import { QueryError } from "@/client/components/QueryState";
import { SkeletonPageContent } from "@/client/components/SkeletonPresets";
import { Button } from "@/client/components/ui/button";
import { useSamAccess } from "@/client/features/sam/useSamAccess";
import { t } from "@/shared/i18n";

/**
 * AI visibility setup researches the brand and suggests prompts through
 * OpenRouter, so a self-hosted install without a key would only fail after
 * the user starts research. Ask for the key first (hosted always has one).
 */
export function OpenRouterKeyGate({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const access = useSamAccess(projectId);
  if (access.status === "ready") return children;
  if (access.status === "checking") return <SkeletonPageContent />;
  if (access.status === "error")
    return (
      <QueryError
        error={access.error}
        fallback={t("ai.couldNotCheckOpenRouter")}
        onRetry={access.onRetry}
        isRetrying={access.isRetrying}
      />
    );
  return (
    <div className="grid min-h-[calc(100dvh-8rem)] place-items-center">
      <GateCard
        className="max-w-2xl"
        icon={KeyRound}
        tone="warning"
        title={t("ai.addOpenRouterKey")}
        description={
          <>
            <p>
              {t("ui.aiVisibilityUsesOpenrouterToResearch")}
            </p>
            <p>
              {t("ui.createAKeyOnOpenrouterSet")}{" "}
              <code>OPENROUTER_API_KEY</code>{t("ui.restartOpenseoThenConfirmHereThe")}{" "}
              <Link
                className="underline underline-offset-2 hover:text-foreground"
                to="/help/openrouter-api-key"
              >
                {t("ui.openrouterApiKeySetupGuide")}
              </Link>{" "}
              {t("ui.hasTheStepsForEachDeployment")}
            </p>
          </>
        }
        actions={
          <>
            <Button
              size="lg"
              pending={access.isRefetching}
              onClick={access.onRetry}
            >
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
      />
    </div>
  );
}
