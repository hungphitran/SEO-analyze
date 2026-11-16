import type { WorkflowStep } from "cloudflare:workers";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { findBlockedAiSearchBots } from "@/server/lib/audit/discovery";
import { getOrigin } from "@/server/lib/audit/url-utils";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import { getAuditScratchpad } from "@/server/features/audit/AuditScratchpad";
import { AuditProgressKV } from "@/server/lib/audit/progress-kv";
import { runMultipageChecks } from "@/server/lib/audit/issues/multipage";
import type { AuditConfig } from "@/server/lib/audit/types";
import { captureServerEvent } from "@/server/lib/posthog";
import type { CrawlPhaseResult } from "@/server/workflows/siteAuditWorkflowCrawl";
import {
  brokenExternalLinkIssues,
  checkExternalLinks,
  runScratchpadLinkChecks,
} from "@/server/workflows/siteAuditWorkflowLinkChecks";
import { pgStep } from "@/server/workflows/pgStep";
import {
  DB_STEP,
  EXTERNAL_LINK_STEP,
  MULTIPAGE_CHECKS_STEP,
} from "@/server/workflows/auditStepConfigs";

export async function finalizeAudit(args: {
  step: WorkflowStep;
  auditId: string;
  workflowInstanceId: string;
  billingCustomer: BillingCustomerContext;
  projectId: string;
  startUrl: string;
  config: AuditConfig;
  crawl: CrawlPhaseResult;
  robotsText: string | null;
}) {
  const {
    step,
    auditId,
    workflowInstanceId,
    billingCustomer,
    projectId,
    startUrl,
    config,
    crawl,
    robotsText,
  } = args;

  // Probing other people's servers is slow and best-effort: its own step so a
  // timeout there can neither fail the audit nor repeat the DB checks. Any
  // failure just means no external-link findings.
  const brokenExternalLinks = await pgStep(
    step,
    "external-link-checks",
    EXTERNAL_LINK_STEP,
    () => checkExternalLinks(auditId),
  );

  await pgStep(step, "multipage-checks", MULTIPAGE_CHECKS_STEP, async () => {
    await AuditRepository.updateAuditProgress(auditId, workflowInstanceId, {
      currentPhase: "finalizing",
    });

    // Integrity guard: pages are persisted inside crawl-chunk steps. If the
    // crawl claims pages but the DB has none, fail loudly instead of
    // completing with an empty audit.
    if (
      crawl.pagesCrawled > 0 &&
      !(await AuditRepository.hasPagesForAudit(auditId))
    ) {
      throw new Error(
        `Audit ${auditId}: crawl reported ${crawl.pagesCrawled} pages but none were persisted`,
      );
    }

    const checksStartedAt = Date.now();
    console.info("Audit finalization started", { auditId });
    const { issues, hasUnreadShells } = await runMultipageChecks({ auditId });
    console.info("Audit multipage checks completed", {
      auditId,
      durationMs: Date.now() - checksStartedAt,
      issueCount: issues.length,
    });
    const linksStartedAt = Date.now();
    const linkIssues = await runScratchpadLinkChecks(auditId, startUrl, {
      ...crawl,
      completed: crawl.completed && !hasUnreadShells,
    });
    console.info("Audit link checks completed", {
      auditId,
      durationMs: Date.now() - linksStartedAt,
      issueCount: linkIssues.length,
    });
    issues.push(
      ...linkIssues,
      ...brokenExternalLinkIssues(brokenExternalLinks),
    );
    if (crawl.stoppedBy) {
      issues.push({
        issueType: crawl.stoppedBy,
        pageId: null,
        pageUrl: startUrl,
      });
    }
    const blockedAiSearchBots = findBlockedAiSearchBots(
      getOrigin(startUrl),
      robotsText,
    );
    if (blockedAiSearchBots.length > 0) {
      issues.push({
        issueType: "ai-search-bot-blocked",
        pageId: null,
        pageUrl: `${getOrigin(startUrl)}/robots.txt`,
        details: { blockedBots: blockedAiSearchBots },
      });
    }
    const persistStartedAt = Date.now();
    await AuditRepository.insertIssues(auditId, issues);
    console.info("Audit finalization issues persisted", {
      auditId,
      durationMs: Date.now() - persistStartedAt,
      issueCount: issues.length,
    });
    return { issueCount: issues.length };
  });

  await pgStep(step, "finalize", DB_STEP, async () => {
    const blockedPages = await AuditRepository.countPagesByFetchClass(
      auditId,
      "blocked",
    );
    const rateLimitedPages = await AuditRepository.countPagesByFetchClass(
      auditId,
      "rate_limited",
    );
    await AuditRepository.completeAudit(auditId, workflowInstanceId, {
      pagesCrawled: crawl.pagesCrawled,
      pagesTotal: crawl.pagesCrawled,
    });
    await captureServerEvent({
      distinctId: billingCustomer.userId,
      event: "site_audit:complete",
      organizationId: billingCustomer.organizationId,
      properties: {
        project_id: projectId,
        status: "completed",
        pages_crawled: crawl.pagesCrawled,
        pages_total: crawl.pagesCrawled,
        crawl_completed: crawl.completed,
        pages_blocked: blockedPages,
        pages_rate_limited: rateLimitedPages,
        run_lighthouse: config.lighthouseStrategy !== "none",
      },
    });
    await AuditProgressKV.clear(auditId);
    // Crawl scratch state (frontier, links, mirror) is no longer needed.
    await getAuditScratchpad(auditId).destroy();
  });
}
