import { sort } from "remeda";
import type { GscSitemap } from "@/server/lib/gscClient";

type SitemapStatus = "ok" | "warnings" | "errors" | "pending";

type SitemapRow = {
  path: string;
  /** Sitemap kind as Google reports it: sitemap, rssFeed, atomFeed... */
  type: string | null;
  isSitemapsIndex: boolean;
  status: SitemapStatus;
  errors: number;
  warnings: number;
  lastSubmitted: string | null;
  lastDownloaded: string | null;
  /** URLs submitted per content type (web, image, video...). Google no longer
   *  fills the `indexed` count, so it is not carried. */
  contents: { type: string; submitted: number }[];
};

function count(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Errors outrank warnings; a sitemap Google has not read yet is pending. */
function sitemapStatus(input: {
  isPending: boolean;
  errors: number;
  warnings: number;
}): SitemapStatus {
  if (input.errors > 0) return "errors";
  if (input.warnings > 0) return "warnings";
  return input.isPending ? "pending" : "ok";
}

/** Reduce `sitemaps.list` to display rows: problems first, then newest submit. */
export function toSitemapRows(sitemaps: GscSitemap[]): SitemapRow[] {
  const rows: SitemapRow[] = [];
  for (const sitemap of sitemaps) {
    const path = text(sitemap.path);
    if (!path) continue;
    const errors = count(sitemap.errors);
    const warnings = count(sitemap.warnings);
    rows.push({
      path,
      type: text(sitemap.type),
      isSitemapsIndex: sitemap.isSitemapsIndex === true,
      status: sitemapStatus({
        isPending: sitemap.isPending === true,
        errors,
        warnings,
      }),
      errors,
      warnings,
      lastSubmitted: text(sitemap.lastSubmitted),
      lastDownloaded: text(sitemap.lastDownloaded),
      contents: (sitemap.contents ?? []).flatMap((content) => {
        const type = text(content.type);
        return type ? [{ type, submitted: count(content.submitted) }] : [];
      }),
    });
  }
  const weight: Record<SitemapStatus, number> = {
    errors: 0,
    warnings: 1,
    pending: 2,
    ok: 3,
  };
  return sort(
    rows,
    (a, b) =>
      weight[a.status] - weight[b.status] ||
      (b.lastSubmitted ?? "").localeCompare(a.lastSubmitted ?? ""),
  );
}
