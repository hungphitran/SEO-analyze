import { describe, expect, it } from "vitest";
import { getProjectNavGroups } from "./items";
import {
  isPaidOnlyNavPath,
  PAID_ONLY_PROJECT_ROUTE_SEGMENTS,
} from "@/shared/free-sources-visibility";

const hrefs = (groups: ReturnType<typeof getProjectNavGroups>) =>
  groups.flatMap((group) => group.items.map((item) => item.to as string));

describe("getProjectNavGroups with FREE_SOURCES_ONLY", () => {
  it("keeps every item when the flag is off", () => {
    const all = hrefs(getProjectNavGroups("p1"));
    expect(all).toContain("/p/$projectId/keywords");
    expect(all).toContain("/p/$projectId/backlinks");
    expect(all).toContain("/p/$projectId/ai-visibility/research");
    expect(all).toEqual(hrefs(getProjectNavGroups("p1", { freeSourcesOnly: false })));
  });

  it("drops every DataForSEO-only item and nothing that free sources serve", () => {
    const free = hrefs(getProjectNavGroups("p1", { freeSourcesOnly: true }));
    for (const to of free) expect(isPaidOnlyNavPath(to)).toBe(false);
    for (const segment of PAID_ONLY_PROJECT_ROUTE_SEGMENTS) {
      expect(free.some((to) => to.includes(`/${segment}`))).toBe(false);
    }
    expect(free).toEqual(
      expect.arrayContaining([
        "/p/$projectId",
        "/p/$projectId/rank-tracking",
        "/p/$projectId/search-performance",
        "/p/$projectId/audit",
        "/p/$projectId/reports",
        "/p/$projectId/context",
        "/ai",
      ]),
    );
  });

  it("removes groups left empty so no blank section headings remain", () => {
    const groups = getProjectNavGroups("p1", { freeSourcesOnly: true });
    expect(groups.every((group) => group.items.length > 0)).toBe(true);
    const labels = groups.map((group) => group.label);
    expect(new Set(labels).size).toBe(labels.length);
    // Research and AI-visibility groups held only paid items.
    expect(groups.length).toBeLessThan(getProjectNavGroups("p1").length);
  });
});
