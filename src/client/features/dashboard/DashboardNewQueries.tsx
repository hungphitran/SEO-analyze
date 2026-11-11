import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { CardShell } from "@/client/components/CardShell";
import { QueryState } from "@/client/components/QueryState";
import { GoogleConnectionCard } from "@/client/features/integrations/GoogleConnectionCard";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/client/components/ui/table";
import { getDashboardEmergingQueries } from "@/serverFunctions/dashboard";
import { Freshness, DashboardInfo } from "./siteTabParts";
import { moreDetailsClass } from "./cardParts";
import { formatUiNumber, t } from "@/shared/i18n";

export function DashboardNewQueries({
  projectId,
  connected,
  siteUrl,
}: {
  projectId: string;
  connected: boolean;
  siteUrl: string | null;
}) {
  const query = useQuery({
    queryKey: ["dashboardEmergingQueries", projectId, siteUrl],
    queryFn: () => getDashboardEmergingQueries({ data: { projectId } }),
    enabled: connected,
    staleTime: 10 * 60_000,
    retry: false,
  });
  if (!connected) return null;
  return (
    <QueryState query={query} errorFallback={t("dashboard.couldNotLoadNewKeywords")}>
      {(data) =>
        !data.value.connected ? (
          <GoogleConnectionCard
            provider="gsc"
            projectId={projectId}
            prominent
          />
        ) : (
          <CardShell
            title={t("dashboard.newKeywords")}
            titleInfo={
              <DashboardInfo label={t("dashboard.aboutNewKeywords")}>
                <p>{t("dashboard.newKeywordsHelp")}</p>
                <p className="mt-2">
                  {t("ui.weSawTheseInTheLatest")}
                </p>
              </DashboardInfo>
            }
            action={
              <Link
                to="/p/$projectId"
                params={{ projectId }}
                search={{ tab: "keywords" }}
                className={moreDetailsClass}
              >
                {t("ui.viewAll")}
              </Link>
            }
          >
            <Freshness {...data} />
            {data.value.rows.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.keyword")}</TableHead>
                    <TableHead>{t("dashboard.impressions")}</TableHead>
                    <TableHead>{t("dashboard.clicks")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.value.rows.slice(0, 5).map((row) => (
                    <TableRow key={row.query}>
                      <TableCell className="font-medium">{row.query}</TableCell>
                      <TableCell>{formatUiNumber(row.impressions)}</TableCell>
                      <TableCell>{row.clicks}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
                <Search className="size-7 text-muted-foreground" />
                <h3 className="font-medium">
                  {data.value.hasSearchData
                    ? t("dashboard.noNewKeywordsThisWeek")
                    : t("dashboard.noSearchDataYet")}
                </h3>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {data.value.hasSearchData
                    ? t("dashboard.existingQueriesStillGain")
                    : t("dashboard.googleHasNotReported")}
                </p>
                <Link
                  to="/p/$projectId/search-performance"
                  params={{ projectId }}
                  className="text-sm text-primary hover:underline"
                >
                  {t("dashboard.viewFullGsc")}
                </Link>
              </div>
            )}
          </CardShell>
        )
      }
    </QueryState>
  );
}
