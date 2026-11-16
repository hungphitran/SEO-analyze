import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { QueryError } from "@/client/components/QueryState";
import { ExternalUrlCell } from "@/client/components/table/url";
import { Button } from "@/client/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/client/components/ui/tabs";
import { localizeFreeSourceMessage } from "@/client/features/integrations/freeSourceMessages";
import { getBingSiteDetailsFn } from "@/serverFunctions/free-sources";
import { getBingLinkHistoryFn } from "@/serverFunctions/free-sources-analytics";
import { formatUiNumber, t } from "@/shared/i18n";

/**
 * Extended Bing Webmaster details (Top Pages, Inbound Links, Crawl Issues).
 * Loaded on demand via button click so opening Integrations never triggers
 * unnecessary Bing API calls against shared-IP rate limits.
 */
export function BingDetailPanel({ projectId }: { projectId: string }) {
  const [loaded, setLoaded] = useState(false);

  const query = useQuery({
    queryKey: ["bing-site-details", projectId],
    queryFn: () => getBingSiteDetailsFn({ data: { projectId } }),
    enabled: loaded,
    staleTime: 10 * 60_000,
  });

  const linkHistoryQuery = useQuery({
    queryKey: ["bing-link-history", projectId],
    queryFn: () => getBingLinkHistoryFn({ data: { projectId } }),
    enabled: loaded,
  });

  const data = query.data;

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{t("bing.detailsTitle")}</p>
        <Button
          size="sm"
          variant="outline"
          disabled={query.isFetching}
          onClick={() => {
            if (!loaded) setLoaded(true);
            else void query.refetch();
          }}
        >
          {query.isFetching
            ? t("common.loading")
            : loaded
              ? t("bing.detailsRefresh")
              : t("bing.detailsLoad")}
        </Button>
      </div>

      {!loaded ? null : query.isPending ? (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      ) : query.isError ? (
        <QueryError
          error={query.error}
          fallback={t("bing.detailsFailed")}
          onRetry={() => void query.refetch()}
          isRetrying={query.isFetching}
          variant="inline"
        />
      ) : !data || !data.connected ? null : data.error ? (
        <p className="text-destructive text-sm">
          {localizeFreeSourceMessage(data.error)}
        </p>
      ) : (
        <Tabs defaultValue="pages">
          <TabsList>
            <TabsTrigger value="pages">{t("bing.tabPages")}</TabsTrigger>
            <TabsTrigger value="links">{t("bing.tabLinks")}</TabsTrigger>
            <TabsTrigger value="crawlIssues">
              {t("bing.tabCrawlIssues")}
            </TabsTrigger>
            <TabsTrigger value="linkHistory">Lịch sử mẫu</TabsTrigger>
          </TabsList>

          <TabsContent value="pages">
            {!data.pages ? null : data.pages.status === "error" ? (
              <p className="text-muted-foreground py-2 text-sm">
                {localizeFreeSourceMessage(data.pages.message)}
              </p>
            ) : data.pages.data.pages.length === 0 ? (
              <p className="text-muted-foreground py-2 text-sm">
                {t("bing.pagesEmpty")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("gscInsights.colPage")}</TableHead>
                      <TableHead className="text-right">
                        {t("gscInsights.colClicks")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("gscInsights.colImpressions")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("gscInsights.colPosition")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.pages.data.pages.map((row) => (
                      <TableRow key={row.url}>
                        <TableCell className="max-w-xs">
                          <ExternalUrlCell value={row.url} label={row.url} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatUiNumber(row.clicks)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatUiNumber(row.impressions)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.avgImpressionPosition == null
                            ? "—"
                            : row.avgImpressionPosition.toFixed(1)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="links">
            {!data.links ? null : data.links.status === "error" ? (
              <p className="text-muted-foreground py-2 text-sm">
                {localizeFreeSourceMessage(data.links.message)}
              </p>
            ) : data.links.data.links.length === 0 ? (
              <p className="text-muted-foreground py-2 text-sm">
                {t("bing.linksEmpty")}
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs">
                  {t("bing.linksTotal", {
                    total: formatUiNumber(data.links.data.totalLinks),
                  })}
                </p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("bing.colTargetUrl")}</TableHead>
                        <TableHead className="text-right">
                          {t("bing.colInboundLinks")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.links.data.links.map((row) => (
                        <TableRow key={row.url}>
                          <TableCell className="max-w-sm">
                            <ExternalUrlCell value={row.url} label={row.url} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatUiNumber(row.count)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="crawlIssues">
            {!data.crawlIssues ? null : data.crawlIssues.status === "error" ? (
              <p className="text-muted-foreground py-2 text-sm">
                {localizeFreeSourceMessage(data.crawlIssues.message)}
              </p>
            ) : data.crawlIssues.data.items.length === 0 ? (
              <p className="text-muted-foreground py-2 text-sm">
                {t("bing.crawlIssuesEmpty")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>URL</TableHead>
                      <TableHead className="text-right">HTTP</TableHead>
                      <TableHead>{t("common.issues")}</TableHead>
                      <TableHead className="text-right">
                        {t("bing.colInLinks")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.crawlIssues.data.items.map((row) => (
                      <TableRow key={`${row.url}-${row.issues}`}>
                        <TableCell className="max-w-xs">
                          <ExternalUrlCell value={row.url} label={row.url} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.httpCode ?? "—"}
                        </TableCell>
                        <TableCell>{row.issues}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatUiNumber(row.inLinks)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="linkHistory">
            {linkHistoryQuery.isPending ? (
              <p className="text-muted-foreground py-2 text-sm">
                {t("common.loading")}
              </p>
            ) : linkHistoryQuery.isError ? (
              <p className="text-destructive py-2 text-sm">
                Không thể tải lịch sử mẫu liên kết Bing.
              </p>
            ) : !linkHistoryQuery.data ? null : (
              <div className="space-y-3 py-2 text-xs">
                <p className="text-muted-foreground">
                  {linkHistoryQuery.data.scopeNote}
                </p>
                <div className="flex flex-wrap gap-3">
                  <span>
                    Mới phát hiện:{" "}
                    <strong>{linkHistoryQuery.data.discovered.length}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Không còn trong mẫu:{" "}
                    <strong>{linkHistoryQuery.data.lost.length}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Giữ nguyên:{" "}
                    <strong>{linkHistoryQuery.data.unchangedCount}</strong>
                  </span>
                </div>
                {linkHistoryQuery.data.discovered.length > 0 && (
                  <div className="space-y-1">
                    <p className="font-medium">Liên kết mới trong mẫu:</p>
                    {linkHistoryQuery.data.discovered.slice(0, 20).map((r) => (
                      <div key={`${r.referringDomain}-${r.targetUrl}`}>
                        {r.targetUrl} ({r.linkCount} inbound)
                      </div>
                    ))}
                  </div>
                )}
                {linkHistoryQuery.data.lost.length > 0 && (
                  <div className="space-y-1 text-muted-foreground">
                    <p className="font-medium text-foreground">
                      Liên kết không còn trong mẫu mới:
                    </p>
                    {linkHistoryQuery.data.lost.slice(0, 20).map((r) => (
                      <div key={`${r.referringDomain}-${r.targetUrl}`}>
                        {r.targetUrl} ({r.linkCount} inbound)
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
