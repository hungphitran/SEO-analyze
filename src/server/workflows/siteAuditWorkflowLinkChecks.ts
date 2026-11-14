import { getAuditScratchpad } from "@/server/features/audit/AuditScratchpad";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import {
  findBrokenExternalLinks,
  MAX_EXTERNAL_EDGE_ROWS,
} from "@/server/lib/audit/external-links";
import type { DetectedIssue } from "@/server/lib/audit/issues/page-reporters";
import { normalizeUrl } from "@/server/lib/audit/url-utils";
import type { CrawlPhaseResult } from "@/server/workflows/siteAuditWorkflowCrawl";

/**
 * Best-effort probe of the audit's external link targets. Never throws: any
 * failure just means no external-link findings.
 */
export async function checkExternalLinks(auditId: string) {
  try {
    const rows = await getAuditScratchpad(auditId).getExternalLinks(
      MAX_EXTERNAL_EDGE_ROWS,
    );
    return await findBrokenExternalLinks(rows);
  } catch (error) {
    console.warn("External link check skipped", { auditId, error });
    return [];
  }
}

export function brokenExternalLinkIssues(
  rows: Awaited<ReturnType<typeof findBrokenExternalLinks>>,
): DetectedIssue[] {
  return rows.map((row) => ({
    issueType: "broken-external-link" as const,
    pageId: row.pageId,
    pageUrl: row.pageUrl,
    dedupeKey: row.targetUrl,
    details: { targetUrl: row.targetUrl, targetStatus: row.targetStatus },
  }));
}

/**
 * The two finalize checks that need link edges run as SQL inside the
 * audit's scratchpad DO; map their rows onto DetectedIssue.
 */
export async function runScratchpadLinkChecks(
  auditId: string,
  startUrl: string,
  crawl: CrawlPhaseResult,
): Promise<DetectedIssue[]> {
  const scratchpad = getAuditScratchpad(auditId);
  const inlinkCounts = await scratchpad.getInlinkCounts();
  if (inlinkCounts) {
    await AuditRepository.updatePageInlinkCounts(auditId, inlinkCounts);
  }
  const { brokenLinks, orphanPages } = await scratchpad.runFinalizeChecks({
    // Page rows store normalized URLs; normalize the start URL the same way
    // so the orphan exclusion matches.
    startUrl: normalizeUrl(startUrl) ?? startUrl,
    // Orphan detection only makes sense when the crawl wasn't truncated.
    crawlCompleted: crawl.completed,
  });

  return [
    ...brokenLinks.map((row) => ({
      issueType: "broken-internal-link" as const,
      pageId: row.sourcePageId,
      pageUrl: row.sourceUrl,
      dedupeKey: row.targetUrl,
      details: { targetUrl: row.targetUrl, targetStatus: row.targetStatus },
    })),
    ...orphanPages.map((row) => ({
      issueType: "orphan-page" as const,
      pageId: row.pageId,
      pageUrl: row.url,
    })),
  ];
}
