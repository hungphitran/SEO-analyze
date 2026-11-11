import {
  Bot,
  ClipboardCheck,
  FolderPlus,
  Globe,
  Lightbulb,
  Users,
} from "lucide-react";
import type { DashboardActivation } from "@/server/features/dashboard/services/DashboardService";
import type { DashboardSetupStep } from "@/types/schemas/dashboard";
import { t } from "@/shared/i18n";

export const setupSteps: {
  id: DashboardSetupStep;
  label: string;
  detail: string;
  icon: typeof Globe;
}[] = [
  {
    id: "competitor",
    label: t("dashboard.exploreCompetitorTitle"),
    detail: t("dashboard.exploreCompetitorDesc"),
    icon: Globe,
  },
  {
    id: "keywords",
    label: t("dashboard.getKeywordIdeas"),
    detail: t("dashboard.getKeywordIdeasDesc"),
    icon: Lightbulb,
  },
  {
    id: "audit",
    label: t("dashboard.auditYourSite"),
    detail: t("dashboard.auditYourSiteDesc"),
    icon: ClipboardCheck,
  },
  {
    id: "mcp",
    label: t("dashboard.connectAiAgent"),
    detail: t("dashboard.connectAiAgentDesc"),
    icon: Bot,
  },
  {
    id: "team",
    label: t("dashboard.inviteTeammate"),
    detail: t("dashboard.inviteTeammateDesc"),
    icon: Users,
  },
  {
    id: "project",
    label: t("dashboard.workingOnMultipleSites"),
    detail:
      t("dashboard.multipleSitesDesc"),
    icon: FolderPlus,
  },
];

export function getStepStatus(
  activation: DashboardActivation,
  step: DashboardSetupStep,
): "done" | "skipped" | "todo" {
  const completed: Record<DashboardSetupStep, boolean> = {
    competitor: activation.competitorClickedAt !== null,
    keywords: activation.keywordsClickedAt !== null,
    audit: activation.hasAudit,
    mcp:
      activation.mcp.authorizedAt !== null ||
      activation.mcp.firstToolCallAt !== null,
    team: activation.hasTeammate,
    project: activation.hasMultipleProjects,
  };
  if (completed[step]) return "done";
  // Preserve previous MCP dismissals without treating them as authorization.
  if (
    activation.dismissedSteps.includes(step) ||
    (step === "mcp" && activation.mcp.cardDismissedAt !== null)
  )
    return "skipped";
  return "todo";
}
