import { DashboardService } from "@/server/features/dashboard/services/DashboardService";
import {
  buildDecliningPages,
  buildStrikingDistanceRows,
  previousPeriod,
  sumSearchTotals,
  toDimensionRows,
} from "@/server/features/gsc/searchPerformanceReport";
import {
  GscNotConnectedError,
  GscService,
  isExpectedGrantFailure,
} from "@/server/features/gsc/services/GscService";
import { resolveDateRange } from "@/server/features/gsc/searchAnalytics";
import { ReportRepository } from "@/server/features/reports/repositories/ReportRepository";
import { ReportService } from "@/server/features/reports/services/ReportService";
import {
  renderSummaryReport,
  type SummaryReportInput,
} from "@/server/features/reports/services/summaryReportHtml";

const SUMMARY_REPORT_CLIENT_LABEL = "OpenSEO (tóm tắt tự động)";
const GSC_ROW_LIMIT = 1000;

/** First-party Search Console numbers, or null when GSC is not usable. */
async function collectGsc(
  projectId: string,
): Promise<SummaryReportInput["gsc"]> {
  const { startDate, endDate } = resolveDateRange({
    dateRange: "last_28_days",
  });
  const prev = previousPeriod(startDate, endDate);
  const get = (
    dimensions: ("date" | "query" | "page")[],
    range: { startDate: string; endDate: string },
    rowLimit: number,
  ) =>
    GscService.getPerformance({
      projectId,
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions,
      rowLimit,
    });
  try {
    const [days, prevDays, queries, pages, prevPages, queryPages] =
      await Promise.all([
        get(["date"], { startDate, endDate }, 200),
        get(["date"], prev, 200),
        get(["query"], { startDate, endDate }, 10),
        get(["page"], { startDate, endDate }, GSC_ROW_LIMIT),
        get(["page"], prev, GSC_ROW_LIMIT),
        get(["query", "page"], { startDate, endDate }, GSC_ROW_LIMIT),
      ]);
    return {
      range: {
        startDate,
        endDate,
        prevStartDate: prev.startDate,
        prevEndDate: prev.endDate,
      },
      totals: sumSearchTotals(days.rows),
      prevTotals: sumSearchTotals(prevDays.rows),
      topQueries: toDimensionRows(queries.rows),
      topPages: toDimensionRows(pages.rows).slice(0, 10),
      striking: buildStrikingDistanceRows(queryPages.rows, 10),
      declining: buildDecliningPages(pages.rows, prevPages.rows, 10),
    };
  } catch (error) {
    if (
      error instanceof GscNotConnectedError ||
      isExpectedGrantFailure(error)
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * Build and save the AI-free summary report for a project. Regenerating on the
 * same day updates that day's report instead of tripping the unique-title rule.
 */
export async function createSummaryReport(input: {
  projectId: string;
  organizationId: string;
  userId: string;
  projectName: string;
  domain: string | null;
}): Promise<{ reportId: string; title: string; created: boolean }> {
  const [gsc, overview] = await Promise.all([
    collectGsc(input.projectId),
    DashboardService.getOverview({
      projectId: input.projectId,
      domain: input.domain,
    }),
  ]);
  const report = renderSummaryReport({
    projectName: input.projectName,
    domain: input.domain,
    generatedAt: new Date().toISOString(),
    gsc,
    audit: overview.audit,
  });
  const existing = await ReportRepository.findReportByTitle(
    input.projectId,
    report.title,
  );
  const saved = await ReportService.saveReport({
    projectId: input.projectId,
    organizationId: input.organizationId,
    reportId: existing?.id,
    title: report.title,
    summary: report.summary,
    html: report.html,
    skill: "summary-no-ai",
    createdBy: SUMMARY_REPORT_CLIENT_LABEL,
    createdByUserId: input.userId,
  });
  return {
    reportId: saved.reportId,
    title: saved.title,
    created: saved.created,
  };
}
