import { describe, expect, it } from "vitest";
import {
  getProjectRouteGate,
  isPaidOnlyDashboardTab,
  isPaidOnlyNavPath,
  isPaidOnlyProjectPath,
  PAID_ONLY_PROJECT_ROUTE_SEGMENTS,
} from "./free-sources-visibility";

describe("isPaidOnlyProjectPath", () => {
  it.each([
    "/p/abc/keywords",
    "/p/abc/keywords/",
    "/p/abc/keywords?q=seo",
    "/p/abc/saved",
    "/p/abc/domain",
    "/p/abc/backlinks",
    "/p/abc/ai-visibility",
    "/p/abc/ai-visibility/research",
    "/p/abc/ai-visibility/prompts/xyz",
    "/p/abc/prompt-explorer",
    "/p/abc/local-seo",
    "/p/abc/local-seo/tracker1",
    "/p/abc/brand-lookup",
  ])("hides %s", (path) => {
    expect(isPaidOnlyProjectPath(path)).toBe(true);
  });

  it.each([
    "/p/abc",
    "/p/abc/",
    "/p/abc/rank-tracking",
    "/p/abc/rank-tracking/cfg1",
    "/p/abc/search-performance",
    "/p/abc/audit",
    "/p/abc/audit/issues/1",
    "/p/abc/reports",
    "/p/abc/context",
    "/p/abc/settings",
    "/p/abc/settings/integrations",
    "/p/abc/sam",
    "/p/abc/keywords-extra",
    "/ai",
    "/projects",
    "/help/dataforseo-api-key",
    "/p/abc/settings/keywords",
  ])("keeps %s", (path) => {
    expect(isPaidOnlyProjectPath(path)).toBe(false);
  });
});

describe("dashboard tabs and nav paths", () => {
  it("hides only the backlinks tab", () => {
    expect(isPaidOnlyDashboardTab("backlinks")).toBe(true);
    expect(isPaidOnlyDashboardTab("keywords")).toBe(false);
    expect(isPaidOnlyDashboardTab("overview")).toBe(false);
    expect(isPaidOnlyDashboardTab(undefined)).toBe(false);
  });

  it("classifies nav route templates the same way", () => {
    for (const segment of PAID_ONLY_PROJECT_ROUTE_SEGMENTS) {
      expect(isPaidOnlyNavPath(`/p/$projectId/${segment}`)).toBe(true);
    }
    expect(isPaidOnlyNavPath("/p/$projectId/ai-visibility/research")).toBe(true);
    expect(isPaidOnlyNavPath("/p/$projectId")).toBe(false);
    expect(isPaidOnlyNavPath("/p/$projectId/rank-tracking")).toBe(false);
    expect(isPaidOnlyNavPath("/ai")).toBe(false);
  });
});

describe("getProjectRouteGate", () => {
  const gate = (
    pathname: string,
    freeSourcesOnly: boolean,
    statusPending = false,
  ) => getProjectRouteGate({ pathname, freeSourcesOnly, statusPending });

  it("redirects a directly typed hidden URL to the dashboard in free mode", () => {
    expect(gate("/p/a/backlinks", true)).toBe("redirect");
    expect(gate("/p/a/ai-visibility/prompts/x", true)).toBe("redirect");
    expect(gate("/p/a/local-seo/t1", true)).toBe("redirect");
  });

  it("waits (renders nothing) until the mode is known", () => {
    expect(gate("/p/a/keywords", false, true)).toBe("wait");
  });

  it("renders hidden pages normally when the flag is off or the check failed", () => {
    expect(gate("/p/a/keywords", false)).toBe("render");
  });

  it("never gates kept pages, even while loading", () => {
    expect(gate("/p/a/rank-tracking", true, true)).toBe("render");
    expect(gate("/p/a", true)).toBe("render");
    expect(gate("/p/a/settings/integrations", true)).toBe("render");
  });
});
