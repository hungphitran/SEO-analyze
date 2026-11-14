import type { UrlInspectionResult } from "@/server/lib/gscClient";

type Issue = { message: string; severity: string | null };

/** The URL Inspection result reduced to what the page shows. */
type UrlInspectionView = {
  /** PASS / PARTIAL / FAIL / NEUTRAL / VERDICT_UNSPECIFIED, as Google sends it. */
  verdict: string | null;
  coverageState: string | null;
  indexingState: string | null;
  robotsTxtState: string | null;
  pageFetchState: string | null;
  lastCrawlTime: string | null;
  crawledAs: string | null;
  googleCanonical: string | null;
  userCanonical: string | null;
  /** The user's canonical differs from the one Google picked. */
  canonicalMismatch: boolean;
  sitemaps: string[];
  referringUrls: string[];
  mobileUsability: { verdict: string | null; issues: Issue[] } | null;
  richResults: {
    verdict: string | null;
    items: { type: string; names: string[]; issues: Issue[] }[];
  } | null;
  amp: {
    verdict: string | null;
    ampUrl: string | null;
    issues: Issue[];
  } | null;
  reportLink: string | null;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function issues(
  list: Array<{ issueMessage?: string; message?: string; severity?: string }>,
): Issue[] {
  return list.flatMap((issue) => {
    const message = text(issue.issueMessage) ?? text(issue.message);
    return message ? [{ message, severity: text(issue.severity) }] : [];
  });
}

export function toUrlInspectionView(
  result: UrlInspectionResult,
): UrlInspectionView {
  const index = result.indexStatusResult;
  const googleCanonical = text(index?.googleCanonical);
  const userCanonical = text(index?.userCanonical);
  const mobile = result.mobileUsabilityResult;
  const rich = result.richResultsResult;
  const amp = result.ampResult;
  return {
    verdict: text(index?.verdict),
    coverageState: text(index?.coverageState),
    indexingState: text(index?.indexingState),
    robotsTxtState: text(index?.robotsTxtState),
    pageFetchState: text(index?.pageFetchState),
    lastCrawlTime: text(index?.lastCrawlTime),
    crawledAs: text(index?.crawledAs),
    googleCanonical,
    userCanonical,
    canonicalMismatch:
      googleCanonical != null &&
      userCanonical != null &&
      googleCanonical !== userCanonical,
    sitemaps: index?.sitemap ?? [],
    referringUrls: (index?.referringUrls ?? []).slice(0, 10),
    mobileUsability: mobile
      ? {
          verdict: text(mobile.verdict),
          issues: issues(
            (mobile.issues ?? []).map((issue) => ({
              message: issue.message ?? issue.issueType,
              severity: issue.severity,
            })),
          ),
        }
      : null,
    richResults: rich
      ? {
          verdict: text(rich.verdict),
          items: (rich.detectedItems ?? []).map((detected) => ({
            type: text(detected.richResultType) ?? "unknown",
            names: (detected.items ?? []).flatMap((item) => {
              const name = text(item.name);
              return name ? [name] : [];
            }),
            issues: (detected.items ?? []).flatMap((item) =>
              issues(item.issues ?? []),
            ),
          })),
        }
      : null,
    amp: amp
      ? {
          verdict: text(amp.verdict),
          ampUrl: text(amp.ampUrl),
          issues: issues(amp.issues ?? []),
        }
      : null,
    reportLink: text(result.inspectionResultLink),
  };
}
