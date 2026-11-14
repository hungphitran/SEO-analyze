/**
 * Pure helpers shared by the audit Pages table, the page detail drawer, the
 * issues summary and the CSV export. Kept free of React so they are testable.
 */
import {
  getIssueDescriptor,
  ISSUE_SEVERITY_ORDER,
  type IssueSeverity,
} from "@/shared/audit-issues";
import type { AuditResultsData } from "@/client/features/audit/results/types";

type PageRow = AuditResultsData["pages"][number];
type IssueRow = AuditResultsData["issues"][number];

const TOP_ISSUE_COUNT = 5;

export function resolveIssueSeverity(issue: {
  issueType: string;
  severity: string;
}): IssueSeverity {
  const descriptor = getIssueDescriptor(issue.issueType);
  if (descriptor) return descriptor.severity;
  return issue.severity === "critical" || issue.severity === "warning"
    ? issue.severity
    : "info";
}

/** Issues grouped by the page they belong to (site-wide issues have no page). */
export function indexIssuesByPage(issues: IssueRow[]): Map<string, IssueRow[]> {
  const byPage = new Map<string, IssueRow[]>();
  for (const issue of issues) {
    if (!issue.pageId) continue;
    const list = byPage.get(issue.pageId);
    if (list) list.push(issue);
    else byPage.set(issue.pageId, [issue]);
  }
  return byPage;
}

export function issueCountsByPage(
  byPage: Map<string, IssueRow[]>,
): Map<string, number> {
  return new Map(
    Array.from(byPage, ([pageId, list]) => [pageId, list.length] as const),
  );
}

/** True when og:title, og:description and og:image are all present. */
export function isOgComplete(
  page: Pick<PageRow, "ogTitle" | "ogDescription" | "ogImage">,
): boolean {
  return Boolean(page.ogTitle && page.ogDescription && page.ogImage);
}

/** The canonical the page declares (tag first, then header), if any. */
export function effectiveCanonical(
  page: Pick<PageRow, "canonicalUrl" | "headerCanonicalUrl">,
): string | null {
  return page.canonicalUrl ?? page.headerCanonicalUrl ?? null;
}

/** True when the page declares a canonical pointing somewhere else. */
export function canonicalDiffers(
  page: Pick<PageRow, "url" | "canonicalUrl" | "headerCanonicalUrl">,
): boolean {
  const canonical = effectiveCanonical(page);
  return canonical !== null && canonical !== page.url;
}

/**
 * Whether the row is an analyzed HTML page. Redirects, errors and non-HTML
 * files carry no title/meta/OG data, so they must not read as "missing".
 */
export function isAnalyzedPage(
  page: Pick<PageRow, "fetchClass" | "statusCode" | "title" | "h1Count">,
): boolean {
  return (
    page.fetchClass === "ok" &&
    page.statusCode !== null &&
    page.statusCode >= 200 &&
    page.statusCode < 300
  );
}

/** False for audits crawled before the technical-signal columns existed. */
export function hasTechnicalSignals(page: Pick<PageRow, "hasViewport">) {
  return page.hasViewport !== null;
}

export function parseHreflang(value: string | null): string[] | null {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : null;
  } catch {
    return null;
  }
}

interface IssueSummary {
  counts: Record<IssueSeverity, number>;
  total: number;
  /** The most frequent issue types, ranked by affected pages. */
  top: Array<{
    issueType: string;
    severity: IssueSeverity;
    pageCount: number;
  }>;
}

export function summarizeIssues(
  issues: IssueRow[],
  limit = TOP_ISSUE_COUNT,
): IssueSummary {
  const counts: Record<IssueSeverity, number> = {
    critical: 0,
    warning: 0,
    info: 0,
  };
  const byType = new Map<string, { severity: IssueSeverity; count: number }>();
  for (const issue of issues) {
    const severity = resolveIssueSeverity(issue);
    counts[severity] += 1;
    const entry = byType.get(issue.issueType);
    if (entry) entry.count += 1;
    else byType.set(issue.issueType, { severity, count: 1 });
  }
  const top = Array.from(byType, ([issueType, entry]) => ({
    issueType,
    severity: entry.severity,
    pageCount: entry.count,
  }))
    // oxlint-disable-next-line eslint-plugin-unicorn/no-array-sort -- local array, client lib target predates toSorted
    .sort(
      (a, b) =>
        b.pageCount - a.pageCount ||
        ISSUE_SEVERITY_ORDER[a.severity] - ISSUE_SEVERITY_ORDER[b.severity] ||
        a.issueType.localeCompare(b.issueType),
    )
    .slice(0, limit);
  return { counts, total: issues.length, top };
}

export interface IssueViewFilter {
  severity: IssueSeverity | "all";
  /** One issue type picked from the summary, or null for none. */
  issueType: string | null;
}

export const EMPTY_ISSUE_FILTER: IssueViewFilter = {
  severity: "all",
  issueType: null,
};

export function filterIssues(
  issues: IssueRow[],
  filter: IssueViewFilter,
): IssueRow[] {
  return issues.filter(
    (issue) =>
      (filter.severity === "all" ||
        resolveIssueSeverity(issue) === filter.severity) &&
      (filter.issueType === null || issue.issueType === filter.issueType),
  );
}
