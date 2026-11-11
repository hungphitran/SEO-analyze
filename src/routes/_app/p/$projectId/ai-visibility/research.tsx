import { createFileRoute } from "@tanstack/react-router";
import { Link2, ListPlus, MessagesSquare } from "lucide-react";
import { z } from "zod";
import { PromptResearchPage } from "@/client/features/ai-visibility/PromptResearchPage";
import { PromptTrackingWithoutUpgradeButton } from "@/client/features/ai-visibility/shared";
import { PaidPlanGate } from "@/client/features/billing/PaidPlanGate";
import { t } from "@/shared/i18n";

export const Route = createFileRoute(
  "/_app/p/$projectId/ai-visibility/research",
)({
  validateSearch: z.object({ q: z.string().trim().max(100).optional() }),
  component: AiResearchRoute,
});

const PROMPT_RESEARCH_FEATURES = [
  {
    icon: MessagesSquare,
    title: t("ai.questionsAboutMarket"),
    body: t("ai.questionsHelp"),
  },
  {
    icon: Link2,
    title: t("ai.whoGetsCited"),
    body: t("ai.whoCitedHelp"),
  },
  {
    icon: ListPlus,
    title: t("ai.trackOnesThatMatter"),
    body: t("ai.pickQuestionsHelp"),
  },
];

function AiResearchRoute() {
  const { projectId } = Route.useParams();
  const { q } = Route.useSearch();
  return (
    <PaidPlanGate
      feature={t("nav.promptResearch")}
      description={t("ai.researchIntro")}
      features={PROMPT_RESEARCH_FEATURES}
      alternative={<PromptTrackingWithoutUpgradeButton projectId={projectId} />}
    >
      <PromptResearchPage key={projectId} projectId={projectId} keyword={q} />
    </PaidPlanGate>
  );
}
