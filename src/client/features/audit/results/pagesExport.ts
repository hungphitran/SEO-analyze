/**
 * The Pages CSV/JSON export: one definition list drives the headers, the CSV
 * rows and the JSON records, so a column can never exist in one and not the
 * other. Pure, so it is testable without the browser export helpers.
 */
import { getAuditIssueCopy } from "@/client/features/audit/issueLabels";
import {
  effectiveCanonical,
  indexIssuesByPage,
  isOgComplete,
  parseHreflang,
} from "@/client/features/audit/results/pageInsights";
import type { AuditResultsData } from "@/client/features/audit/results/types";
import type { CsvValue } from "@/client/lib/csv";
import { t } from "@/shared/i18n";

type PageRow = AuditResultsData["pages"][number];
type IssueRow = AuditResultsData["issues"][number];

interface ExportColumn {
  key: string;
  header: string;
  value: (page: PageRow, issues: IssueRow[]) => CsvValue;
}

const bool = (value: boolean | null): CsvValue =>
  value === null ? "" : value ? "yes" : "no";

const PAGE_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "url", header: t("audit.exportUrl"), value: (p) => p.url },
  {
    key: "statusCode",
    header: t("audit.exportStatus"),
    value: (p) => p.statusCode,
  },
  {
    key: "redirectUrl",
    header: t("auditDetail.colRedirect"),
    value: (p) => p.redirectUrl ?? "",
  },
  { key: "title", header: t("audit.exportTitle"), value: (p) => p.title ?? "" },
  {
    key: "metaDescription",
    header: t("auditDetail.colMetaDescription"),
    value: (p) => p.metaDescription ?? "",
  },
  {
    key: "issueCount",
    header: t("auditDetail.exportIssues"),
    value: (_p, i) => i.length,
  },
  {
    key: "issueTypes",
    header: t("auditDetail.exportIssueTypes"),
    value: (_p, i) =>
      Array.from(
        new Set(i.map((x) => getAuditIssueCopy(x.issueType).title)),
      ).join("; "),
  },
  {
    key: "isIndexable",
    header: t("auditDetail.colIndexable"),
    value: (p) => bool(p.isIndexable),
  },
  {
    key: "robotsMeta",
    header: t("auditDetail.exportRobots"),
    value: (p) => p.robotsMeta ?? "",
  },
  {
    key: "xRobotsTag",
    header: t("auditDetail.fieldXRobots"),
    value: (p) => p.xRobotsTag ?? "",
  },
  {
    key: "canonical",
    header: t("auditDetail.colCanonical"),
    value: (p) => effectiveCanonical(p) ?? "",
  },
  {
    key: "headerCanonicalUrl",
    header: t("auditDetail.fieldHeaderCanonical"),
    value: (p) => p.headerCanonicalUrl ?? "",
  },
  {
    key: "ogTitle",
    header: t("auditDetail.fieldOgTitle"),
    value: (p) => p.ogTitle ?? "",
  },
  {
    key: "ogDescription",
    header: t("auditDetail.fieldOgDescription"),
    value: (p) => p.ogDescription ?? "",
  },
  {
    key: "ogImage",
    header: t("auditDetail.fieldOgImage"),
    value: (p) => p.ogImage ?? "",
  },
  {
    key: "ogComplete",
    header: t("auditDetail.colOg"),
    value: (p) => bool(isOgComplete(p)),
  },
  {
    key: "twitterCard",
    header: t("auditDetail.fieldTwitterCard"),
    value: (p) => p.twitterCard ?? "",
  },
  { key: "h1Count", header: "H1", value: (p) => p.h1Count },
  {
    key: "h2Count",
    header: t("auditDetail.exportH2"),
    value: (p) => p.h2Count,
  },
  {
    key: "h3Count",
    header: t("auditDetail.exportH3"),
    value: (p) => p.h3Count,
  },
  {
    key: "h4Count",
    header: t("auditDetail.exportH4"),
    value: (p) => p.h4Count,
  },
  {
    key: "h5Count",
    header: t("auditDetail.exportH5"),
    value: (p) => p.h5Count,
  },
  {
    key: "h6Count",
    header: t("auditDetail.exportH6"),
    value: (p) => p.h6Count,
  },
  {
    key: "wordCount",
    header: t("audit.exportWords"),
    value: (p) => p.wordCount,
  },
  {
    key: "imagesTotal",
    header: t("auditDetail.exportImagesTotal"),
    value: (p) => p.imagesTotal,
  },
  {
    key: "imagesMissingAlt",
    header: t("auditDetail.exportMissingAlt"),
    value: (p) => p.imagesMissingAlt,
  },
  {
    key: "internalLinkCount",
    header: t("auditDetail.colInternalLinks"),
    value: (p) => p.internalLinkCount,
  },
  {
    key: "externalLinkCount",
    header: t("auditDetail.colExternalLinks"),
    value: (p) => p.externalLinkCount,
  },
  {
    key: "inlinkCount",
    header: t("auditDetail.colInlinks"),
    value: (p) => p.inlinkCount ?? "",
  },
  {
    key: "crawlDepth",
    header: t("auditDetail.colDepth"),
    value: (p) => p.crawlDepth ?? "",
  },
  {
    key: "inSitemap",
    header: t("auditDetail.colInSitemap"),
    value: (p) => bool(p.inSitemap),
  },
  {
    key: "htmlLang",
    header: t("auditDetail.colLang"),
    value: (p) => p.htmlLang ?? "",
  },
  {
    key: "hasViewport",
    header: t("auditDetail.colViewport"),
    value: (p) => bool(p.hasViewport),
  },
  {
    key: "jsonLdCount",
    header: t("auditDetail.colJsonLd"),
    value: (p) => p.jsonLdCount ?? "",
  },
  {
    key: "jsonLdInvalidCount",
    header: t("auditDetail.exportJsonLdInvalid"),
    value: (p) => p.jsonLdInvalidCount ?? "",
  },
  {
    key: "mixedContentCount",
    header: t("auditDetail.fieldMixedContent"),
    value: (p) => p.mixedContentCount ?? "",
  },
  {
    key: "hreflang",
    header: t("auditDetail.fieldHreflang"),
    value: (p) => parseHreflang(p.hreflangJson)?.join("; ") ?? "",
  },
  {
    key: "htmlBytes",
    header: t("auditDetail.exportHtmlBytes"),
    value: (p) => p.htmlBytes ?? "",
  },
  {
    key: "responseTimeMs",
    header: t("auditDetail.exportResponseMs"),
    value: (p) => p.responseTimeMs,
  },
];

export function buildPagesExport(
  pages: AuditResultsData["pages"],
  issues: AuditResultsData["issues"],
) {
  const byPage = indexIssuesByPage(issues);
  const pageIssues = (page: PageRow) => byPage.get(page.id) ?? [];
  return {
    headers: PAGE_EXPORT_COLUMNS.map((column) => column.header),
    rows: pages.map((page) =>
      PAGE_EXPORT_COLUMNS.map((column) => column.value(page, pageIssues(page))),
    ),
    records: pages.map((page) =>
      Object.fromEntries(
        PAGE_EXPORT_COLUMNS.map((column) => [
          column.key,
          column.value(page, pageIssues(page)),
        ]),
      ),
    ),
  };
}
