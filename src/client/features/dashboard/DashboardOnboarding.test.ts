import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { DashboardActivation } from "@/server/features/dashboard/services/DashboardService";
import { DashboardOnboarding } from "./DashboardOnboarding";
import { setupSteps } from "./dashboardSteps";
import { t } from "@/shared/i18n";

vi.mock("@/serverFunctions/dashboard", () => ({
  setDashboardStepDismissed: vi.fn(),
}));
vi.mock("@/serverFunctions/config", () => ({
  getSeoApiKeyStatus: vi.fn(),
}));
vi.mock("./DashboardSetupAction", () => ({
  DashboardSetupAction: () => createElement("div", null, "Connection setup"),
}));

const fresh: DashboardActivation = {
  domain: null,
  ga4: { connected: false, propertyDisplayName: null, cardDismissedAt: null },
  gsc: { connected: false, siteUrl: null },
  mcp: { authorizedAt: null, firstToolCallAt: null, cardDismissedAt: null },
  competitorClickedAt: null,
  keywordsClickedAt: null,
  hasAudit: false,
  hasMultipleProjects: false,
  hasTeammate: false,
  dismissedSteps: [],
};

function renderChecklist(
  activation = fresh,
  status?: { configured: boolean; freeSourcesOnly: boolean },
) {
  const client = new QueryClient();
  if (status) client.setQueryData(["seoApiKeyStatus"], status);
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(DashboardOnboarding, {
        projectId: "project-a",
        activation,
      }),
    ),
  );
}

describe("dashboard onboarding visibility", () => {
  it("keeps skipped steps available to restore", () => {
    const markup = renderChecklist({
      ...fresh,
      dismissedSteps: setupSteps.map((step) => step.id),
    });
    expect(markup).toContain(t("ui.savedForLater"));
  });

  it("renders nothing once every step is complete", () => {
    expect(
      renderChecklist({
        ...fresh,
        competitorClickedAt: "2026-09-28",
        keywordsClickedAt: "2026-09-28",
        hasAudit: true,
        mcp: { ...fresh.mcp, authorizedAt: "2026-09-28" },
        hasTeammate: true,
        hasMultipleProjects: true,
      }),
    ).toBe("");
  });

  it("hides the DataForSEO-only steps when FREE_SOURCES_ONLY is on", () => {
    const free = renderChecklist(fresh, {
      configured: false,
      freeSourcesOnly: true,
    });
    expect(free).not.toContain(t("dashboard.exploreCompetitorTitle"));
    expect(free).not.toContain(t("dashboard.getKeywordIdeas"));
    expect(free).toContain(t("dashboard.auditYourSite"));

    const paid = renderChecklist(fresh, {
      configured: true,
      freeSourcesOnly: false,
    });
    expect(paid).toContain(t("dashboard.exploreCompetitorTitle"));
    expect(paid).toContain(t("dashboard.getKeywordIdeas"));
  });

  it("is complete in free mode without the hidden steps", () => {
    expect(
      renderChecklist(
        {
          ...fresh,
          hasAudit: true,
          mcp: { ...fresh.mcp, authorizedAt: "2026-09-28" },
          hasTeammate: true,
          hasMultipleProjects: true,
        },
        { configured: false, freeSourcesOnly: true },
      ),
    ).toBe("");
  });
});
