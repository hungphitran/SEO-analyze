import { type ColumnDef, type VisibilityState } from "@tanstack/react-table";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import {
  EmptyCell,
  displayPath,
  hasAnalyzedContent,
  pageColumnHelper,
} from "@/client/features/audit/results/pagesTableCells";
import {
  nullableNumberSort,
  nullableStringSort,
  type PageRow,
} from "@/client/features/audit/results/AuditResultsTableFilterLogic";
import { isOgComplete } from "@/client/features/audit/results/pageInsights";
import { t } from "@/shared/i18n";

function numberColumn(
  key:
    | "h2Count"
    | "internalLinkCount"
    | "externalLinkCount"
    | "inlinkCount"
    | "crawlDepth",
  label: string,
) {
  return pageColumnHelper.accessor(key, {
    header: ({ column }) => <SortableHeader column={column} label={label} />,
    cell: ({ getValue }) => {
      const value = getValue();
      return value === null ? <EmptyCell /> : value;
    },
    sortingFn: nullableNumberSort,
  });
}

export function buildOptionalPagesColumns(
  canonicalHost: string,
): ColumnDef<PageRow>[] {
  return [
    pageColumnHelper.accessor("redirectUrl", {
      header: ({ column }) => (
        <SortableHeader column={column} label={t("auditDetail.colRedirect")} />
      ),
      cell: ({ getValue }) => {
        const target = getValue();
        return target ? (
          <span className="break-all text-xs" title={target}>
            {displayPath(target, canonicalHost)}
          </span>
        ) : (
          <EmptyCell />
        );
      },
      sortingFn: nullableStringSort,
      meta: { cellClassName: "max-w-[220px]" },
    }),
    numberColumn("h2Count", t("auditDetail.colH2")),
    numberColumn("internalLinkCount", t("auditDetail.colInternalLinks")),
    numberColumn("externalLinkCount", t("auditDetail.colExternalLinks")),
    numberColumn("inlinkCount", t("auditDetail.colInlinks")),
    numberColumn("crawlDepth", t("auditDetail.colDepth")),
    pageColumnHelper.accessor("inSitemap", {
      header: ({ column }) => (
        <SortableHeader column={column} label={t("auditDetail.colInSitemap")} />
      ),
      cell: ({ getValue }) => (
        <span className="text-xs">
          {getValue() ? t("common.yes") : t("common.no")}
        </span>
      ),
    }),
    pageColumnHelper.accessor("jsonLdCount", {
      header: ({ column }) => (
        <SortableHeader column={column} label={t("auditDetail.colJsonLd")} />
      ),
      cell: ({ getValue, row }) => {
        const count = getValue();
        if (count === null) return <EmptyCell />;
        const invalid = row.original.jsonLdInvalidCount ?? 0;
        return invalid > 0 ? (
          <span className="text-xs text-destructive">
            {t("auditDetail.jsonLdInvalid", { count: invalid })}
          </span>
        ) : (
          <span className="text-xs">{count}</span>
        );
      },
      sortingFn: nullableNumberSort,
    }),
    pageColumnHelper.display({
      id: "ogComplete",
      header: t("auditDetail.colOg"),
      cell: ({ row }) => {
        if (!hasAnalyzedContent(row.original)) return <EmptyCell />;
        return isOgComplete(row.original) ? (
          <span className="text-xs">{t("auditDetail.ogComplete")}</span>
        ) : (
          <span className="text-xs text-warning">
            {t("auditDetail.ogIncomplete")}
          </span>
        );
      },
    }),
    pageColumnHelper.accessor("htmlLang", {
      header: ({ column }) => (
        <SortableHeader column={column} label={t("auditDetail.colLang")} />
      ),
      cell: ({ getValue }) => getValue() ?? <EmptyCell />,
      sortingFn: nullableStringSort,
    }),
    pageColumnHelper.accessor("hasViewport", {
      header: t("auditDetail.colViewport"),
      cell: ({ getValue }) => {
        const value = getValue();
        if (value === null) return <EmptyCell />;
        return (
          <span className="text-xs">
            {value ? t("common.yes") : t("common.no")}
          </span>
        );
      },
    }),
    pageColumnHelper.accessor("htmlBytes", {
      header: ({ column }) => (
        <SortableHeader column={column} label={t("auditDetail.colHtmlSize")} />
      ),
      cell: ({ getValue }) => {
        const bytes = getValue();
        return bytes === null ? (
          <EmptyCell />
        ) : (
          <span className="text-xs">{Math.round(bytes / 1024)} KB</span>
        );
      },
      sortingFn: nullableNumberSort,
    }),
  ];
}

/** Columns the picker can switch on and off; hidden until chosen. */
export const OPTIONAL_COLUMNS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "redirectUrl", label: t("auditDetail.colRedirect") },
  { id: "h2Count", label: t("auditDetail.colH2") },
  { id: "internalLinkCount", label: t("auditDetail.colInternalLinks") },
  { id: "externalLinkCount", label: t("auditDetail.colExternalLinks") },
  { id: "inlinkCount", label: t("auditDetail.colInlinks") },
  { id: "crawlDepth", label: t("auditDetail.colDepth") },
  { id: "inSitemap", label: t("auditDetail.colInSitemap") },
  { id: "jsonLdCount", label: t("auditDetail.colJsonLd") },
  { id: "ogComplete", label: t("auditDetail.colOg") },
  { id: "htmlLang", label: t("auditDetail.colLang") },
  { id: "hasViewport", label: t("auditDetail.colViewport") },
  { id: "htmlBytes", label: t("auditDetail.colHtmlSize") },
];

export const DEFAULT_COLUMN_VISIBILITY: VisibilityState = Object.fromEntries(
  OPTIONAL_COLUMNS.map((column) => [column.id, false]),
);
