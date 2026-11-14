/**
 * Per-page issue reporters.
 *
 * Each reporter is a pure function over a single crawled page record —
 * DOM-free by design (HTML parsing runs once in crawlPage), so the engine works
 * over any crawl source that can produce a CrawledPageResult.
 *
 * Cross-page checks (duplicates, broken links, orphans, redirect chains)
 * live in multipage.ts and run over D1 after the crawl.
 */
import type { AuditIssueType } from "@/shared/audit-issues";
import type { CrawledPageResult } from "@/server/lib/audit/types";

export interface DetectedIssue {
  issueType: AuditIssueType;
  pageId: string | null;
  pageUrl: string;
  details?: Record<string, unknown>;
  /**
   * Distinguishes multiple issues of the same type on the same page
   * (e.g. one broken-internal-link issue per target). Part of the
   * deterministic row id, so step retries don't duplicate issues.
   */
  dedupeKey?: string;
}

const TITLE_MAX_CHARS = 60;
const TITLE_MIN_CHARS = 10;
const META_DESCRIPTION_MAX_CHARS = 160;
const META_DESCRIPTION_MIN_CHARS = 70;
const THIN_CONTENT_WORDS = 150;
const SLOW_RESPONSE_MS = 1500;
const DEEP_PAGE_DEPTH = 5;
// Meta tags are uncapped in the HTML, so bound the copy stored on each issue.
const MAX_FLAGGED_TEXT_CHARS = 100;

function truncateFlaggedText(text: string): string {
  return text.length > MAX_FLAGGED_TEXT_CHARS
    ? `${text.slice(0, MAX_FLAGGED_TEXT_CHARS)}…`
    : text;
}

function hasHeadingLevelSkip(headingOrder: number[]): boolean {
  for (let i = 1; i < headingOrder.length; i++) {
    if (headingOrder[i] > headingOrder[i - 1] + 1) return true;
  }
  return false;
}

// hreflang = language, optional script and region, or the x-default marker.
const HREFLANG_VALUE =
  /^(x-default|[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|[0-9]{3}))?)$/i;

/** Invalid or repeated hreflang values on one page, in document order. */
export function findHreflangProblems(tags: string[]): {
  invalid: string[];
  duplicated: string[];
} {
  const seen = new Set<string>();
  const invalid: string[] = [];
  const duplicated: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (!HREFLANG_VALUE.test(tag)) {
      if (!invalid.includes(tag)) invalid.push(tag);
      continue;
    }
    const key = tag.toLowerCase();
    if (seen.has(key)) {
      if (!duplicated.includes(key)) duplicated.push(key);
    }
    seen.add(key);
  }
  return { invalid, duplicated };
}

type Reporter = (
  issueType: AuditIssueType,
  details?: Record<string, unknown>,
) => void;

/** Open Graph and hreflang checks, from data the crawler already extracted. */
function reportSocialAndInternational(
  page: CrawledPageResult,
  report: Reporter,
) {
  if (page.isIndexable) {
    const missingOg = [
      page.ogTitle ? null : "og:title",
      page.ogDescription ? null : "og:description",
      page.ogImage ? null : "og:image",
    ].filter((tag): tag is string => tag !== null);
    if (missingOg.length > 0)
      report("missing-open-graph", { missing: missingOg });
  }

  if (page.hreflangTags.length > 0) {
    const { invalid, duplicated } = findHreflangProblems(page.hreflangTags);
    if (invalid.length > 0 || duplicated.length > 0) {
      report("hreflang-invalid", { invalid, duplicated });
    }
    if (
      !page.hreflangTags.some((tag) => tag.trim().toLowerCase() === "x-default")
    ) {
      report("hreflang-missing-x-default", {
        tags: page.hreflangTags.slice(0, 10),
      });
    }
  }
}

export function runPageReporters(page: CrawledPageResult): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  const report = (
    issueType: AuditIssueType,
    details?: Record<string, unknown>,
  ) => issues.push({ issueType, pageId: page.id, pageUrl: page.url, details });

  if (page.fetchClass === "blocked") {
    report("blocked-page", { statusCode: page.statusCode });
    return issues;
  }
  if (page.fetchClass === "rate_limited") {
    report("rate-limited-page", { statusCode: page.statusCode });
    return issues;
  }
  if (page.fetchClass === "error") {
    return issues;
  }

  if (page.statusCode >= 500) {
    report("server-error", { statusCode: page.statusCode });
    return issues;
  }
  if (page.statusCode >= 400) {
    report("broken-page", { statusCode: page.statusCode });
    return issues;
  }
  // Redirects are normal on their own; chains/loops are flagged in multipage.
  if (page.statusCode >= 300) {
    return issues;
  }

  if (page.responseTimeMs > SLOW_RESPONSE_MS) {
    report("slow-response", { responseTimeMs: page.responseTimeMs });
  }

  // Content checks only make sense for analyzed HTML documents (a PDF has no
  // title tag to miss).
  if (!page.isHtml) {
    return issues;
  }

  // Indexability + canonical signals
  if (!page.isIndexable) {
    report("noindex-page", {
      robotsMeta: page.robotsMeta,
      xRobotsTag: page.xRobotsTag,
    });
  }
  if (
    page.canonicalUrl &&
    page.headerCanonicalUrl &&
    page.canonicalUrl !== page.headerCanonicalUrl
  ) {
    report("canonical-conflict", {
      htmlCanonical: page.canonicalUrl,
      headerCanonical: page.headerCanonicalUrl,
    });
  }
  const effectiveCanonical = page.canonicalUrl ?? page.headerCanonicalUrl;
  if (effectiveCanonical && effectiveCanonical !== page.url) {
    report("canonicalized-page", { canonicalUrl: effectiveCanonical });
  }

  if (page.crawlDepth !== null && page.crawlDepth >= DEEP_PAGE_DEPTH) {
    report("deep-page", { crawlDepth: page.crawlDepth });
  }

  // The initial app shell cannot establish what the rendered page is missing.
  // Report the coverage gap instead of thin-content/missing-heading claims.
  if (page.javascriptShell) {
    report("javascript-rendering-suspected", { wordCount: page.wordCount });
    return issues;
  }

  // Titles
  if (!page.title) {
    report("missing-title");
  } else if (page.title.length > TITLE_MAX_CHARS) {
    report("title-too-long", {
      length: page.title.length,
      max: TITLE_MAX_CHARS,
      title: truncateFlaggedText(page.title),
    });
  } else if (page.title.length < TITLE_MIN_CHARS) {
    report("title-too-short", {
      length: page.title.length,
      min: TITLE_MIN_CHARS,
      title: page.title,
    });
  }

  // Meta description
  if (!page.metaDescription) {
    report("missing-meta-description");
  } else if (page.metaDescription.length > META_DESCRIPTION_MAX_CHARS) {
    report("meta-description-too-long", {
      length: page.metaDescription.length,
      max: META_DESCRIPTION_MAX_CHARS,
      description: truncateFlaggedText(page.metaDescription),
    });
  } else if (page.metaDescription.length < META_DESCRIPTION_MIN_CHARS) {
    report("meta-description-too-short", {
      length: page.metaDescription.length,
      min: META_DESCRIPTION_MIN_CHARS,
      description: page.metaDescription,
    });
  }

  // Headings
  if (page.h1Count === 0) {
    report("missing-h1");
  } else if (page.h1Count > 1) {
    report("multiple-h1", { h1Count: page.h1Count });
  }
  if (hasHeadingLevelSkip(page.headingOrder)) {
    report("heading-order-skip");
  }

  reportSocialAndInternational(page, report);

  // Content quality
  if (page.isIndexable && page.wordCount < THIN_CONTENT_WORDS) {
    report("thin-content", { wordCount: page.wordCount });
  }
  if (page.imagesMissingAlt > 0) {
    report("images-missing-alt", {
      imagesMissingAlt: page.imagesMissingAlt,
      imagesTotal: page.imagesTotal,
    });
  }

  // Structure
  if (page.isIndexable && page.links.length === 0) {
    report("no-outgoing-links");
  }

  return issues;
}
