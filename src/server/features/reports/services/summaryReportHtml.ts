import type { DashboardAuditSummary } from "@/server/features/dashboard/services/DashboardService";
import { getAuditIssueTitle } from "@/client/features/audit/issueLabels";
import { t } from "@/shared/i18n";

/**
 * Deterministic, AI-free summary report: pure functions from already-fetched
 * data to a self-contained HTML document (inline style only; the report
 * sandbox forbids scripts). Kept free of I/O so it is unit tested directly.
 */

type Totals = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type SummaryReportInput = {
  projectName: string;
  domain: string | null;
  /** ISO timestamp. */
  generatedAt: string;
  gsc: {
    range: {
      startDate: string;
      endDate: string;
      prevStartDate: string;
      prevEndDate: string;
    };
    totals: Totals;
    prevTotals: Totals;
    topQueries: { key: string; clicks: number; impressions: number }[];
    topPages: { key: string; clicks: number; impressions: number }[];
    striking: {
      query: string;
      page: string;
      impressions: number;
      position: number;
    }[];
    declining: {
      page: string;
      clicks: number;
      prevClicks: number;
      clicksChange: number;
    }[];
  } | null;
  audit: DashboardAuditSummary | null;
};

type SummaryReport = { title: string; summary: string; html: string };

const ROWS = 10;
const number = new Intl.NumberFormat("vi-VN");
const decimal = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** "+12,5%", "-3%", "—" when there is no baseline to compare with. */
export function formatChange(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "0%" : "—";
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${decimal.format(rounded)}%`;
}

function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

function table(headers: string[], rows: string[][], numericFrom = 1): string {
  const head = headers
    .map(
      (h, i) =>
        `<th${i >= numericFrom ? ' class="num"' : ""}>${escapeHtml(h)}</th>`,
    )
    .join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (cell, i) =>
              `<td${i >= numericFrom ? ' class="num"' : ""}>${escapeHtml(cell)}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function section(heading: string, inner: string): string {
  return `<section><h2>${escapeHtml(heading)}</h2>${inner}</section>`;
}

function none(): string {
  return `<p class="muted">${escapeHtml(t("summaryReport.none"))}</p>`;
}

function statusLabel(status: DashboardAuditSummary["status"]): string {
  if (status === "running") return t("summaryReport.statusRunning");
  if (status === "failed") return t("summaryReport.statusFailed");
  return t("summaryReport.statusCompleted");
}

function severityLabel(severity: "critical" | "warning" | "info"): string {
  if (severity === "critical") return t("summaryReport.severityCritical");
  if (severity === "warning") return t("summaryReport.severityWarning");
  return t("summaryReport.severityInfo");
}

function gscSection(gsc: NonNullable<SummaryReportInput["gsc"]>): string {
  const { totals, prevTotals } = gsc;
  const metrics = table(
    [
      t("summaryReport.metric"),
      t("summaryReport.current"),
      t("summaryReport.previous"),
      t("summaryReport.change"),
    ],
    [
      [
        t("summaryReport.clicks"),
        number.format(totals.clicks),
        number.format(prevTotals.clicks),
        formatChange(totals.clicks, prevTotals.clicks),
      ],
      [
        t("summaryReport.impressions"),
        number.format(totals.impressions),
        number.format(prevTotals.impressions),
        formatChange(totals.impressions, prevTotals.impressions),
      ],
      [
        t("summaryReport.ctr"),
        `${decimal.format(totals.ctr * 100)}%`,
        `${decimal.format(prevTotals.ctr * 100)}%`,
        formatChange(totals.ctr, prevTotals.ctr),
      ],
      [
        t("summaryReport.position"),
        decimal.format(totals.position),
        decimal.format(prevTotals.position),
        // Lower position is better, so the sign is not a judgement here.
        formatChange(totals.position, prevTotals.position),
      ],
    ],
  );
  const pairs = (
    rows: { key: string; clicks: number; impressions: number }[],
    label: string,
    pathKey: boolean,
  ) =>
    rows.length === 0
      ? none()
      : table(
          [label, t("summaryReport.clicks"), t("summaryReport.impressions")],
          rows
            .slice(0, ROWS)
            .map((r) => [
              pathKey ? pathOf(r.key) : r.key,
              number.format(r.clicks),
              number.format(r.impressions),
            ]),
        );
  const striking =
    gsc.striking.length === 0
      ? none()
      : table(
          [
            t("summaryReport.query"),
            t("summaryReport.page"),
            t("summaryReport.impressions"),
            t("summaryReport.position"),
          ],
          gsc.striking
            .slice(0, ROWS)
            .map((r) => [
              r.query,
              pathOf(r.page),
              number.format(r.impressions),
              decimal.format(r.position),
            ]),
          2,
        );
  const declining =
    gsc.declining.length === 0
      ? none()
      : table(
          [
            t("summaryReport.page"),
            t("summaryReport.current"),
            t("summaryReport.previous"),
            t("summaryReport.change"),
          ],
          gsc.declining
            .slice(0, ROWS)
            .map((r) => [
              pathOf(r.page),
              number.format(r.clicks),
              number.format(r.prevClicks),
              `${decimal.format(Math.round(r.clicksChange * 100))}%`,
            ]),
        );
  return section(
    t("summaryReport.gscHeading"),
    `${metrics}<h3>${escapeHtml(t("summaryReport.topQueries"))}</h3>${pairs(gsc.topQueries, t("summaryReport.query"), false)}<h3>${escapeHtml(t("summaryReport.topPages"))}</h3>${pairs(gsc.topPages, t("summaryReport.page"), true)}<h3>${escapeHtml(t("summaryReport.striking"))}</h3>${striking}<h3>${escapeHtml(t("summaryReport.declining"))}</h3>${declining}`,
  );
}

function auditSection(audit: DashboardAuditSummary): string {
  const facts = table(
    [t("summaryReport.metric"), t("summaryReport.current")],
    [
      [t("summaryReport.auditStatus"), statusLabel(audit.status)],
      [t("summaryReport.auditPages"), number.format(audit.pagesCrawled)],
      [t("summaryReport.auditStarted"), audit.startedAt.slice(0, 10)],
    ],
  );
  const issues =
    audit.topIssues.length === 0
      ? none()
      : table(
          [
            t("summaryReport.auditIssue"),
            t("summaryReport.auditSeverity"),
            t("summaryReport.auditAffected"),
          ],
          audit.topIssues
            .slice(0, ROWS)
            .map((i) => [
              getAuditIssueTitle(i.issueType),
              severityLabel(i.severity),
              number.format(i.count),
            ]),
          2,
        );
  return section(t("summaryReport.auditHeading"), `${facts}${issues}`);
}

const STYLE =
  "body{font-family:system-ui,sans-serif;max-width:860px;margin:2rem auto;padding:0 1rem;color:#1a1a1a;line-height:1.5}" +
  "h1{font-size:1.6rem;margin-bottom:.25rem}h2{font-size:1.2rem;margin-top:2rem;border-bottom:1px solid #ddd;padding-bottom:.25rem}h3{font-size:1rem;margin-top:1.25rem}" +
  "table{border-collapse:collapse;width:100%;margin:.5rem 0}th,td{border-bottom:1px solid #e5e5e5;padding:.35rem .5rem;text-align:left;font-size:.9rem;word-break:break-word}" +
  "th{background:#f6f6f6}.num{text-align:right;white-space:nowrap}.muted{color:#666;font-size:.9rem}";

export function renderSummaryReport(input: SummaryReportInput): SummaryReport {
  const date = input.generatedAt.slice(0, 10);
  const domain = input.domain?.trim() || null;
  const title = (
    domain
      ? t("summaryReport.title", { domain, date })
      : t("summaryReport.titleNoDomain", { date })
  ).slice(0, 120);

  const parts: string[] = [];
  if (input.gsc) {
    const r = input.gsc.range;
    parts.push(
      `<p class="muted">${escapeHtml(
        t("summaryReport.period", {
          start: r.startDate,
          end: r.endDate,
          prevStart: r.prevStartDate,
          prevEnd: r.prevEndDate,
        }),
      )}</p>`,
      gscSection(input.gsc),
    );
  } else {
    parts.push(
      section(
        t("summaryReport.gscHeading"),
        `<p class="muted">${escapeHtml(t("summaryReport.gscMissing"))}</p>`,
      ),
    );
  }
  parts.push(
    input.audit
      ? auditSection(input.audit)
      : section(
          t("summaryReport.auditHeading"),
          `<p class="muted">${escapeHtml(t("summaryReport.auditMissing"))}</p>`,
        ),
  );

  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body><h1>${escapeHtml(title)}</h1><p class="muted">${escapeHtml(input.projectName)} · ${escapeHtml(t("summaryReport.generated", { time: input.generatedAt.slice(0, 16).replace("T", " ") + " UTC" }))}</p>${parts.join("")}</body></html>`;

  const summaryParts: string[] = [];
  if (input.gsc) {
    summaryParts.push(
      t("summaryReport.summaryText", {
        clicks: number.format(input.gsc.totals.clicks),
        clicksChange: formatChange(
          input.gsc.totals.clicks,
          input.gsc.prevTotals.clicks,
        ),
        impressions: number.format(input.gsc.totals.impressions),
        issues: number.format(input.audit?.topIssues.length ?? 0),
      }),
    );
  } else {
    summaryParts.push(t("summaryReport.gscMissing"));
  }
  return { title, summary: summaryParts.join(" ").slice(0, 2500), html };
}
