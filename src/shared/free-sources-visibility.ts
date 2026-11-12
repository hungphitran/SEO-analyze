/**
 * What the UI hides when FREE_SOURCES_ONLY=true.
 *
 * Features below only work with DataForSEO data (keyword volume/difficulty,
 * backlink graphs, domain traffic estimates, AI-visibility and local-pack
 * collection). With the flag on they are removed from navigation, cards and
 * buttons, and their routes redirect to the dashboard. Nothing is deleted:
 * the backend code and routes still exist, so turning the flag off restores
 * everything.
 *
 * Kept (a free source can serve them): Dashboard (Search Console, site audit),
 * Rank tracking (SerpApi/OpenSERP), Search performance (Search Console, Bing
 * via Integrations), Site audit (own crawler + PageSpeed Insights), Reports,
 * Context, Agent setup, project Settings/Integrations (PageSpeed, CrUX, Bing).
 */

/** Project route segments (after /p/:projectId) that need DataForSEO. */
export const PAID_ONLY_PROJECT_ROUTE_SEGMENTS = [
  "keywords",
  "saved",
  "domain",
  "backlinks",
  "ai-visibility",
  "prompt-explorer",
  "local-seo",
  "brand-lookup",
] as const;

/** Dashboard tabs backed only by DataForSEO. */
export const PAID_ONLY_DASHBOARD_TABS = ["backlinks"] as const;

/** Onboarding steps that open DataForSEO-only pages. */
export const PAID_ONLY_SETUP_STEPS = ["competitor", "keywords"] as const;

/**
 * Is this pathname a project page that needs DataForSEO? Matches the segment
 * itself and anything below it (/ai-visibility/prompts/x), never a look-alike
 * (/keywords-extra) or a different project area.
 */
export function isPaidOnlyProjectPath(pathname: string): boolean {
  const match = /^\/p\/[^/]+\/([^/?#]+)/.exec(pathname);
  if (!match) return false;
  return (PAID_ONLY_PROJECT_ROUTE_SEGMENTS as readonly string[]).includes(
    match[1],
  );
}

export function isPaidOnlyDashboardTab(tab: string | undefined): boolean {
  return (
    tab !== undefined &&
    (PAID_ONLY_DASHBOARD_TABS as readonly string[]).includes(tab)
  );
}

/** Nav item path (route template) that needs DataForSEO. */
export function isPaidOnlyNavPath(to: string): boolean {
  const match = /^\/p\/\$projectId\/([^/]+)/.exec(to);
  if (!match) return false;
  return (PAID_ONLY_PROJECT_ROUTE_SEGMENTS as readonly string[]).includes(
    match[1],
  );
}

export type ProjectRouteGate = "render" | "wait" | "redirect";

/**
 * What the project layout does for a URL: show the page, wait for the mode to
 * be known (so a hidden page never starts its data calls), or redirect to the
 * dashboard. A failed or unknown mode check never hides anything.
 */
export function getProjectRouteGate(input: {
  pathname: string;
  freeSourcesOnly: boolean;
  statusPending: boolean;
}): ProjectRouteGate {
  if (!isPaidOnlyProjectPath(input.pathname)) return "render";
  if (input.statusPending) return "wait";
  return input.freeSourcesOnly ? "redirect" : "render";
}
