import { type ColumnDef } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/client/components/ui/badge";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import { HttpStatusBadge } from "@/client/features/audit/shared";
import {
  EmptyCell,
  displayPath,
  hasAnalyzedContent,
  isRedirect,
  pageColumnHelper,
} from "@/client/features/audit/results/pagesTableCells";
import {
  nullableNumberSort,
  nullableStringSort,
  type PageRow,
} from "@/client/features/audit/results/AuditResultsTableFilterLogic";
import {
  canonicalDiffers,
  effectiveCanonical,
} from "@/client/features/audit/results/pageInsights";
import { t } from "@/shared/i18n";

export function buildPagesColumns({
  canonicalHost,
  missingTitlePageIds,
  issueCounts,
}: {
  canonicalHost: string;
  missingTitlePageIds: Set<string>;
  issueCounts: ReadonlyMap<string, number>;
}): ColumnDef<PageRow>[] {
  return [
    pageColumnHelper.accessor("url", {
      header: ({ column }) => <SortableHeader column={column} label="URL" />,
      cell: ({ getValue }) => {
        const url = getValue();
        return (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <span className="truncate">{displayPath(url, canonicalHost)}</span>
            <ExternalLink className="size-3 shrink-0" />
          </a>
        );
      },
      meta: { cellClassName: "max-w-[240px] truncate" },
    }),
    pageColumnHelper.accessor("statusCode", {
      header: ({ column }) => (
        <SortableHeader column={column} label={t("audit.status")} />
      ),
      // A failed fetch or render has no HTTP status to show.
      cell: ({ getValue, row }) =>
        row.original.fetchClass === "error" ? (
          <Badge variant="destructive" size="sm" title={t("audit.fetchFailed")}>
            {t("ui.failed_0dc2")}
          </Badge>
        ) : (
          <HttpStatusBadge code={getValue()} />
        ),
      sortingFn: nullableNumberSort,
    }),
    pageColumnHelper.accessor("title", {
      header: ({ column }) => (
        <SortableHeader column={column} label={t("common.title")} />
      ),
      cell: ({ getValue, row }) => {
        if (isRedirect(row.original)) {
          const target = row.original.redirectUrl;
          return (
            <span className="text-xs text-muted-foreground">
              → {target ? displayPath(target, canonicalHost) : "redirect"}
            </span>
          );
        }
        const title = getValue();
        if (title) {
          return <span className="break-words">{title}</span>;
        }
        // Red only when the engine flagged it — a 200 that isn't an HTML
        // document (robots.txt, security.txt) legitimately has no title.
        return missingTitlePageIds.has(row.original.id) ? (
          <span className="text-destructive text-xs">{t("ui.missing")}</span>
        ) : (
          <EmptyCell />
        );
      },
      sortingFn: nullableStringSort,
      meta: { cellClassName: "max-w-[360px]" },
    }),
    pageColumnHelper.accessor("metaDescription", {
      header: ({ column }) => (
        <SortableHeader
          column={column}
          label={t("auditDetail.colMetaDescription")}
        />
      ),
      cell: ({ getValue, row }) => {
        if (!hasAnalyzedContent(row.original)) return <EmptyCell />;
        const description = getValue();
        return description ? (
          <span
            className="line-clamp-2 break-words text-xs"
            title={description}
          >
            {description}
          </span>
        ) : (
          <span className="text-destructive text-xs">{t("ui.missing")}</span>
        );
      },
      sortingFn: nullableStringSort,
      meta: { cellClassName: "max-w-[280px]" },
    }),
    pageColumnHelper.accessor((row) => issueCounts.get(row.id) ?? 0, {
      id: "issueCount",
      header: ({ column }) => (
        <SortableHeader column={column} label={t("auditDetail.colIssues")} />
      ),
      cell: ({ getValue }) => {
        const count = getValue();
        return count > 0 ? (
          <Badge variant="warning" size="sm">
            {count}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">0</span>
        );
      },
    }),
    pageColumnHelper.accessor("isIndexable", {
      header: ({ column }) => (
        <SortableHeader column={column} label={t("auditDetail.colIndexable")} />
      ),
      cell: ({ getValue, row }) => {
        if (!hasAnalyzedContent(row.original)) return <EmptyCell />;
        return getValue() ? (
          <span className="text-xs">{t("auditDetail.indexable")}</span>
        ) : (
          <Badge variant="destructive" size="sm">
            {t("auditDetail.noindex")}
          </Badge>
        );
      },
    }),
    pageColumnHelper.display({
      id: "canonical",
      header: t("auditDetail.colCanonical"),
      cell: ({ row }) => {
        if (!hasAnalyzedContent(row.original)) return <EmptyCell />;
        const canonical = effectiveCanonical(row.original);
        if (canonical === null) {
          return (
            <span className="text-xs text-muted-foreground">
              {t("auditDetail.canonicalNone")}
            </span>
          );
        }
        return canonicalDiffers(row.original) ? (
          <span className="break-all text-xs text-warning" title={canonical}>
            {displayPath(canonical, canonicalHost)}
          </span>
        ) : (
          <span className="text-xs">{t("auditDetail.canonicalSelf")}</span>
        );
      },
      meta: { cellClassName: "max-w-[200px]" },
    }),
    pageColumnHelper.accessor("h1Count", {
      header: ({ column }) => <SortableHeader column={column} label="H1" />,
      cell: ({ getValue, row }) =>
        hasAnalyzedContent(row.original) ? getValue() : <EmptyCell />,
    }),
    pageColumnHelper.accessor("wordCount", {
      header: ({ column }) => (
        <SortableHeader column={column} label={t("audit.words")} />
      ),
      cell: ({ getValue, row }) =>
        hasAnalyzedContent(row.original) ? getValue() : <EmptyCell />,
    }),
    pageColumnHelper.display({
      id: "images",
      header: ({ column }) => (
        <SortableHeader column={column} label={t("audit.images")} />
      ),
      cell: ({ row }) => {
        if (!hasAnalyzedContent(row.original)) return <EmptyCell />;
        return row.original.imagesMissingAlt > 0 ? (
          <span className="text-warning">
            {row.original.imagesMissingAlt}/{row.original.imagesTotal}
          </span>
        ) : (
          row.original.imagesTotal
        );
      },
      enableSorting: true,
      sortingFn: (left, right) =>
        left.original.imagesMissingAlt - right.original.imagesMissingAlt ||
        left.original.imagesTotal - right.original.imagesTotal,
    }),
    pageColumnHelper.accessor("responseTimeMs", {
      header: ({ column }) => (
        <SortableHeader column={column} label={t("audit.speed")} />
      ),
      cell: ({ getValue }) => {
        const value = getValue();
        return value ? (
          <span className="text-xs">{value}ms</span>
        ) : (
          <EmptyCell />
        );
      },
      sortingFn: nullableNumberSort,
    }),
  ];
}
