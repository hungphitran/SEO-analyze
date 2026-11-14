import { useQuery } from "@tanstack/react-query";
import { QueryError } from "@/client/components/QueryState";
import { SkeletonTableRows } from "@/client/components/SkeletonPresets";
import { Badge } from "@/client/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { GoogleConnectionCard } from "@/client/features/integrations/GoogleConnectionCard";
import { formatCount } from "@/client/features/search-performance/SearchPerformanceColumns";
import { getGscSitemaps } from "@/serverFunctions/searchConsoleDetail";
import { t, type MessageKey } from "@/shared/i18n";

type SitemapStatus = Extract<
  Awaited<ReturnType<typeof getGscSitemaps>>,
  { connected: true }
>["sitemaps"][number]["status"];

const STATUS_LABELS: Record<SitemapStatus, MessageKey> = {
  ok: "gscDetail.sitemapOk",
  warnings: "gscDetail.sitemapWarnings",
  errors: "gscDetail.sitemapErrors",
  pending: "gscDetail.sitemapPending",
};

const STATUS_CLASSES: Record<SitemapStatus, string> = {
  ok: "text-success",
  warnings: "text-warning-foreground dark:text-warning",
  errors: "text-destructive",
  pending: "text-muted-foreground",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN");
}

/** The sitemaps Google holds for the connected property, with their status. */
export function SearchSitemapsTab({ projectId }: { projectId: string }) {
  const query = useQuery({
    queryKey: ["gscSitemaps", projectId],
    queryFn: () => getGscSitemaps({ data: { projectId } }),
    staleTime: 5 * 60_000,
  });

  if (query.isPending) return <SkeletonTableRows className="p-4" />;
  if (query.isError || !query.data) {
    return (
      <div className="p-4">
        <QueryError
          error={query.error}
          fallback={t("gscDetail.sitemapsFailed")}
          onRetry={() => void query.refetch()}
          isRetrying={query.isFetching}
        />
      </div>
    );
  }
  if (!query.data.connected) {
    return (
      <div className="max-w-2xl p-4">
        <GoogleConnectionCard provider="gsc" projectId={projectId} />
      </div>
    );
  }
  const { sitemaps, siteUrl } = query.data;
  if (sitemaps.length === 0) {
    return (
      <div className="space-y-1 p-6 text-sm" role="status">
        <p className="font-medium">{t("gscDetail.sitemapsEmptyTitle")}</p>
        <p className="text-muted-foreground">
          {t("gscDetail.sitemapsEmptyDesc", { site: siteUrl })}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2 p-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("gscDetail.sitemap")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead className="text-right">
                {t("gscDetail.sitemapErrorsCol")}
              </TableHead>
              <TableHead className="text-right">
                {t("gscDetail.sitemapWarningsCol")}
              </TableHead>
              <TableHead>{t("gscDetail.sitemapSubmitted")}</TableHead>
              <TableHead>{t("gscDetail.sitemapDownloaded")}</TableHead>
              <TableHead>{t("gscDetail.sitemapUrls")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sitemaps.map((sitemap) => (
              <TableRow key={sitemap.path}>
                <TableCell className="max-w-md">
                  <span className="block truncate" title={sitemap.path}>
                    {sitemap.path}
                  </span>
                  {sitemap.isSitemapsIndex ? (
                    <Badge size="sm" variant="outline">
                      {t("gscDetail.sitemapIndex")}
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className={STATUS_CLASSES[sitemap.status]}>
                  {t(STATUS_LABELS[sitemap.status])}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCount(sitemap.errors)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCount(sitemap.warnings)}
                </TableCell>
                <TableCell>{formatDate(sitemap.lastSubmitted)}</TableCell>
                <TableCell>{formatDate(sitemap.lastDownloaded)}</TableCell>
                <TableCell className="tabular-nums">
                  {sitemap.contents.length === 0
                    ? "—"
                    : sitemap.contents
                        .map(
                          (content) =>
                            `${content.type}: ${formatCount(content.submitted)}`,
                        )
                        .join(", ")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-muted-foreground text-xs">
        {t("gscDetail.sitemapsNote")}
      </p>
    </div>
  );
}
