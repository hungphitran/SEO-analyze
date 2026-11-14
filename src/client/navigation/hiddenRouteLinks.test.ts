import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { PAID_ONLY_PROJECT_ROUTE_SEGMENTS } from "@/shared/free-sources-visibility";

/**
 * Regression guard against dead links under FREE_SOURCES_ONLY: any client file
 * that links to a hidden (DataForSEO-only) project route must be inside the
 * hidden feature itself, or be on this reviewed list of places that gate the
 * link. A new unreviewed link fails this test.
 */
const ROOT = join(__dirname, "..", "..");

const HIDDEN_FEATURE_DIRS = [
  "client/features/keywords/",
  "client/features/saved-keywords/",
  "client/features/domain/",
  "client/features/backlinks/",
  "client/features/ai-visibility/",
  "client/features/ai-search/",
  "client/features/local-seo/",
  "client/features/search-tabs/",
  "routes/_app/p/$projectId/keywords",
  "routes/_app/p/$projectId/saved",
  "routes/_app/p/$projectId/domain",
  "routes/_app/p/$projectId/backlinks",
  "routes/_app/p/$projectId/ai-visibility",
  "routes/_app/p/$projectId/prompt-explorer",
  "routes/_app/p/$projectId/local-seo",
  "routes/_app/p/$projectId/brand-lookup",
];

/** Reviewed files that mention a hidden route but gate it (with the reason). */
const GATED_LINKS: Record<string, string> = {
  "client/navigation/items.ts": "nav items filtered by getProjectNavGroups",
  "client/components/Sidebar.tsx":
    "only active-state matching for a hidden item",
  "client/features/dashboard/DashboardSetupAction.tsx":
    "competitor/keywords setup steps are removed in free mode",
  "routes/_authenticated.onboarding.index.tsx":
    "post-signup domain redirect is skipped in free mode",
};

function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("links to hidden routes", () => {
  it("only appear inside hidden features or reviewed, gated places", () => {
    const pattern = new RegExp(
      `/p/\\$projectId/(${PAID_ONLY_PROJECT_ROUTE_SEGMENTS.join("|")})\\b`,
    );
    const offenders: string[] = [];
    for (const file of [
      ...walk(join(ROOT, "client")),
      ...walk(join(ROOT, "routes")),
    ]) {
      const rel = relative(ROOT, file);
      if (rel.endsWith("routeTree.gen.ts")) continue;
      if (HIDDEN_FEATURE_DIRS.some((dir) => rel.startsWith(dir))) continue;
      if (rel in GATED_LINKS) continue;
      if (pattern.test(readFileSync(file, "utf8"))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it("every reviewed file still references a hidden route (list stays honest)", () => {
    const pattern = new RegExp(
      `/p/\\$projectId/(${PAID_ONLY_PROJECT_ROUTE_SEGMENTS.join("|")})\\b`,
    );
    for (const rel of Object.keys(GATED_LINKS)) {
      expect(pattern.test(readFileSync(join(ROOT, rel), "utf8"))).toBe(true);
    }
  });
});
