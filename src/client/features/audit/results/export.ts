import type { AuditResultsData } from "@/client/features/audit/results/types";
import { getAuditIssueCopy } from "@/client/features/audit/issueLabels";
import { t } from "@/shared/i18n";
import type { CsvValue } from "@/client/lib/csv";
import { exportRows } from "@/client/lib/exportRows";

type AuditExportFormat = "csv" | "json" | "sheets";

const ISSUES_HEADERS = [
  t("audit.exportSeverity"),
  t("audit.exportIssue"),
  t("audit.exportUrl"),
  t("audit.exportDetails"),
  t("audit.exportHowToFix"),
];

function issuesRows(issues: AuditResultsData["issues"]): CsvValue[][] {
  return issues.map((issue) => {
    const copy = getAuditIssueCopy(issue.issueType);
    return [
      issue.severity,
      copy.title,
      issue.pageUrl,
      issue.detailsJson ?? "",
      copy.howToFix,
    ];
  });
}

export function exportIssues(
  issues: AuditResultsData["issues"],
  format: AuditExportFormat,
) {
  void exportRows({
    format,
    feature: "audit_issues",
    headers: ISSUES_HEADERS,
    rows: issuesRows(issues),
    filename: "audit-issues",
    records:
      format === "json"
        ? issues.map((issue) => {
            const copy = getAuditIssueCopy(issue.issueType);
            return {
              severity: issue.severity,
              issueType: issue.issueType,
              issue: copy.title,
              url: issue.pageUrl,
              details: issue.detailsJson
                ? (JSON.parse(issue.detailsJson) as unknown)
                : null,
              howToFix: copy.howToFix || null,
            };
          })
        : undefined,
  });
}

const PAGES_HEADERS = [
  t("audit.exportUrl"),
  t("audit.exportStatus"),
  t("audit.exportTitle"),
  "H1",
  t("audit.exportWords"),
  t("audit.exportImages"),
  t("audit.exportMissingAlt"),
  t("audit.exportResponseMs"),
];

function pagesRows(pages: AuditResultsData["pages"]): CsvValue[][] {
  return pages.map((page) => [
    page.url,
    page.statusCode,
    page.title ?? "",
    page.h1Count,
    page.wordCount,
    page.imagesTotal,
    page.imagesMissingAlt,
    page.responseTimeMs,
  ]);
}

const PERFORMANCE_HEADERS = [
  t("audit.exportUrl"),
  t("audit.exportDevice"),
  t("audit.exportPerformance"),
  t("audit.exportAccessibility"),
  "SEO",
  "LCP (ms)",
  "CLS",
  "INP (ms)",
  t("audit.ttfbMs"),
];

function performanceRows(
  lighthouse: AuditResultsData["lighthouse"],
  pages: AuditResultsData["pages"],
): CsvValue[][] {
  return lighthouse.map((result) => {
    const page = pages.find((candidate) => candidate.id === result.pageId);
    return [
      page?.url ?? "",
      result.strategy,
      result.performanceScore,
      result.accessibilityScore,
      result.seoScore,
      result.lcpMs,
      result.cls,
      result.inpMs,
      result.ttfbMs,
    ];
  });
}

export function exportPages(
  pages: AuditResultsData["pages"],
  format: AuditExportFormat,
) {
  void exportRows({
    format,
    feature: "audit_pages",
    headers: PAGES_HEADERS,
    rows: pagesRows(pages),
    filename: "audit-pages",
    records: pages.map((page) => ({
      url: page.url,
      statusCode: page.statusCode,
      title: page.title ?? "",
      h1Count: page.h1Count,
      wordCount: page.wordCount,
      imagesTotal: page.imagesTotal,
      imagesMissingAlt: page.imagesMissingAlt,
      responseTimeMs: page.responseTimeMs,
    })),
  });
}

export function exportPerformance(
  lighthouse: AuditResultsData["lighthouse"],
  pages: AuditResultsData["pages"],
  format: AuditExportFormat,
) {
  void exportRows({
    format,
    feature: "audit_performance",
    headers: PERFORMANCE_HEADERS,
    rows: performanceRows(lighthouse, pages),
    filename: "audit-performance",
    records: lighthouse.map((result) => {
      const page = pages.find((candidate) => candidate.id === result.pageId);
      return {
        url: page?.url ?? "",
        strategy: result.strategy,
        performance: result.performanceScore,
        accessibility: result.accessibilityScore,
        seo: result.seoScore,
        lcpMs: result.lcpMs,
        cls: result.cls,
        inpMs: result.inpMs,
        ttfbMs: result.ttfbMs,
      };
    }),
  });
}
