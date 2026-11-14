import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  formatChange,
  renderSummaryReport,
  type SummaryReportInput,
} from "@/server/features/reports/services/summaryReportHtml";
import { REPORT_MAX_HTML_BYTES } from "@/types/schemas/reports";

const totals = (clicks: number, impressions: number, position = 8) => ({
  clicks,
  impressions,
  ctr: impressions ? clicks / impressions : 0,
  position,
});

const base: SummaryReportInput = {
  projectName: "Shop <demo>",
  domain: "example.com",
  generatedAt: "2026-11-14T06:30:00.000Z",
  gsc: {
    range: {
      startDate: "2026-10-14",
      endDate: "2026-11-10",
      prevStartDate: "2026-09-16",
      prevEndDate: "2026-10-13",
    },
    totals: totals(120, 4000),
    prevTotals: totals(100, 5000),
    topQueries: [{ key: "giày <script>", clicks: 30, impressions: 900 }],
    topPages: [
      { key: "https://example.com/a?x=1&y=2", clicks: 20, impressions: 700 },
    ],
    striking: [
      {
        query: "mua giày",
        page: "https://example.com/b",
        impressions: 500,
        position: 7.2,
      },
    ],
    declining: [
      {
        page: "https://example.com/old",
        clicks: 3,
        prevClicks: 20,
        clicksChange: -0.85,
      },
    ],
  },
  audit: {
    id: "a1",
    status: "completed",
    pagesCrawled: 42,
    pagesTotal: 100,
    currentPhase: null,
    lighthouseCompleted: 0,
    lighthouseFailed: 0,
    lighthouseTotal: 0,
    startedAt: "2026-11-12T01:00:00.000Z",
    topIssues: [
      { issueType: "missing-open-graph", severity: "info", count: 12 },
      { issueType: "missing-title", severity: "critical", count: 2 },
    ],
  },
};

describe("formatChange", () => {
  it("formats signed percent changes in Vietnamese notation", () => {
    expect(formatChange(120, 100)).toBe("+20%");
    expect(formatChange(90, 100)).toBe("-10%");
    expect(formatChange(105, 100)).toBe("+5%");
    expect(formatChange(10.25, 8)).toBe("+28,1%");
  });

  it("does not divide by zero", () => {
    expect(formatChange(0, 0)).toBe("0%");
    expect(formatChange(5, 0)).toBe("—");
  });
});

describe("escapeHtml", () => {
  it("escapes the five dangerous characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
  });
});

describe("renderSummaryReport", () => {
  it("produces a complete, script-free document that passes the save checks", () => {
    const report = renderSummaryReport(base);
    const html = report.html.trim().toLowerCase();
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html.endsWith("</html>")).toBe(true);
    expect(html).not.toContain("<script");
    expect(report.title).toBe("Báo cáo tóm tắt SEO example.com 2026-11-14");
    expect(report.title.length).toBeLessThanOrEqual(120);
    expect(report.summary).toContain("120");
    expect(new TextEncoder().encode(report.html).length).toBeLessThan(
      REPORT_MAX_HTML_BYTES,
    );
  });

  it("escapes data that came from outside (queries, project name, urls)", () => {
    const { html } = renderSummaryReport(base);
    expect(html).toContain("giày &lt;script&gt;");
    expect(html).toContain("Shop &lt;demo&gt;");
    expect(html).toContain("/a?x=1&amp;y=2");
    expect(html).not.toContain("giày <script>");
  });

  it("shows Vietnamese issue titles and the gsc change column", () => {
    const { html } = renderSummaryReport(base);
    expect(html).toContain("Thẻ Open Graph chưa đầy đủ");
    expect(html).toContain("+20%");
    expect(html).toContain("-85%");
  });

  it("explains what is missing when GSC and the audit are absent", () => {
    const report = renderSummaryReport({ ...base, gsc: null, audit: null });
    expect(report.html).toContain("Chưa kết nối Google Search Console");
    expect(report.html).toContain("Chưa có bản kiểm tra nào");
    expect(report.summary).toContain("Chưa kết nối Google Search Console");
  });

  it("uses a domain-less title when the project has no website", () => {
    const report = renderSummaryReport({ ...base, domain: null });
    expect(report.title).toBe("Báo cáo tóm tắt SEO 2026-11-14");
  });
});
