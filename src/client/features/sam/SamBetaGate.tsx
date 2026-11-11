import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { GateCard } from "@/client/components/GateCard";
import { Button } from "@/client/components/ui/button";
import { t } from "@/shared/i18n";

/**
 * Shown on the chat route until the user opts into Sam. Sam is the OpenSEO
 * MCP plus skills wrapped in an in-app chat; the agents people already use
 * run that same toolset with a more mature harness, so the primary action
 * points there and Sam is the explicit fallback.
 */
export function SamBetaGate({ onContinue }: { onContinue: () => void }) {
  return (
    <GateCard
      icon={Sparkles}
      title={t("sam.inBeta")}
      description={
        <>
          <p>
            {t("ui.samIsTheOpenseoMcpAnd")}
          </p>
          <p>{t("sam.betaDisclaimer")}</p>
        </>
      }
      actions={
        <>
          <Button size="lg" nativeButton={false} render={<Link to="/ai" />}>
            {t("ui.setUpYourAgent")}
          </Button>
          <Button size="lg" variant="ghost" onClick={onContinue}>
            {t("ui.useSamAnyway")}
          </Button>
        </>
      }
    />
  );
}
