import { createColumnHelper } from "@tanstack/react-table";
import {
  extractHostname,
  extractPathname,
} from "@/client/features/audit/shared";
import type { PageRow } from "@/client/features/audit/results/AuditResultsTableFilterLogic";

export const pageColumnHelper = createColumnHelper<PageRow>();

/**
 * Path shown in the URL/redirect cells. Redirect sources on another host
 * (e.g. the apex domain 301ing to www) would otherwise render identically
 * to their target, so include the host whenever it differs from the
 * site's canonical host.
 */
export function displayPath(url: string, canonicalHost: string): string {
  const host = extractHostname(url);
  const path = extractPathname(url);
  return host === canonicalHost ? path : host + path;
}

/**
 * The host most of the site's real (2xx) pages live on. The start URL's host
 * is only a fallback: audits often start from the apex domain of a site that
 * canonicalizes to www, and prefixing every row with the host is exactly the
 * noise this display is meant to avoid.
 */
export function predominantHost(pages: PageRow[], startUrl: string): string {
  const counts = new Map<string, number>();
  for (const page of pages) {
    if (page.statusCode === null || page.statusCode >= 300) continue;
    const host = extractHostname(page.url);
    counts.set(host, (counts.get(host) ?? 0) + 1);
  }
  let best = extractHostname(startUrl);
  let bestCount = 0;
  for (const [host, count] of counts) {
    if (count > bestCount) {
      best = host;
      bestCount = count;
    }
  }
  return best;
}

export function isRedirect(row: PageRow): boolean {
  return (
    row.statusCode !== null && row.statusCode >= 300 && row.statusCode < 400
  );
}

/** Redirects and blocked/errored fetches have no analyzed content — their
 * zero H1/word/image counts are an artifact, not a finding. */
export function hasAnalyzedContent(row: PageRow): boolean {
  return row.fetchClass === "ok" && !isRedirect(row);
}

export const EmptyCell = () => (
  <span className="text-xs text-muted-foreground">-</span>
);
