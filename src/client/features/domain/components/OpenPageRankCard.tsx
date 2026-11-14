import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { QueryError } from "@/client/components/QueryState";
import { Card } from "@/client/components/ui/card";
import { MetricsTable } from "@/client/components/MetricsTable";
import { getOpenPageRankFn } from "@/serverFunctions/free-sources";
import { t } from "@/shared/i18n";
import { formatOpenPageRankScore } from "@/shared/real-user-signals";

/**
 * Open PageRank authority score for the searched domain. Independent of the
 * DataForSEO-backed overview, so it also shows with FREE_SOURCES_ONLY=true.
 * Renders nothing when the server has no OPEN_PAGERANK_API_KEY.
 */
export function OpenPageRankCard({
  projectId,
  domain,
  quiet = false,
}: {
  projectId: string;
  domain: string;
  /**
   * Dashboard mode: show the card only for a usable score. A rejected key, a
   * blocked address, a rate limit or an upstream error render nothing instead
   * of a warning (the Integrations page still explains setup problems).
   */
  quiet?: boolean;
}) {
  const trimmed = domain.trim();
  const query = useQuery({
    enabled: trimmed !== "",
    queryKey: ["open-pagerank", projectId, trimmed],
    queryFn: () => getOpenPageRankFn({ data: { projectId, domain: trimmed } }),
    staleTime: 30 * 60_000,
    retry: false,
  });

  if (query.isError) {
    if (quiet) return null;
    return (
      <QueryError
        error={query.error}
        fallback={t("opr.loadFailed")}
        onRetry={() => {
          void query.refetch();
        }}
        isRetrying={query.isFetching}
        variant="inline"
      />
    );
  }
  const data = query.data;
  if (!data || data.state === "disabled" || data.state === "invalid_domain") {
    return null;
  }

  if (quiet && data.state !== "ok" && data.state !== "no_data") return null;

  let body: ReactNode;
  switch (data.state) {
    case "ok": {
      const rows = [
        {
          label: t("opr.score"),
          value: `${formatOpenPageRankScore(data.score)} / 10`,
        },
        ...(data.host && data.host.score != null
          ? [
              {
                label: t("opr.host", { host: data.host.name }),
                value: `${formatOpenPageRankScore(data.host.score)} / 10`,
              },
            ]
          : []),
        {
          label: t("opr.rank"),
          value:
            data.rank != null ? `#${data.rank.toLocaleString("vi-VN")}` : "—",
        },
        {
          label: t("opr.referring"),
          value:
            data.referringDomains != null
              ? Math.round(data.referringDomains).toLocaleString("vi-VN")
              : "—",
        },
      ];
      body = (
        <>
          <div className="w-full max-w-xl rounded-lg border border-border p-3">
            <MetricsTable rows={rows} />
          </div>
          <p className="text-muted-foreground text-xs">
            {t("opr.hint")}
            {data.asOf ? ` ${t("opr.asOf", { date: data.asOf })}` : ""}
          </p>
        </>
      );
      break;
    }
    case "no_data":
      body = (
        <p className="text-muted-foreground">
          {t("opr.noData", { domain: data.domain })}
        </p>
      );
      break;
    case "rate_limited":
      body = (
        <p className="text-muted-foreground">
          {t("opr.rateLimited", { seconds: data.retryAfterSeconds })}
        </p>
      );
      break;
    case "address_blocked":
      body = <p className="text-muted-foreground">{t("opr.addressBlocked")}</p>;
      break;
    case "auth_error":
      body = <p className="text-muted-foreground">{t("opr.authError")}</p>;
      break;
    default:
      body = (
        <p className="text-muted-foreground">
          {t("opr.error", { message: data.message })}
        </p>
      );
  }

  return (
    <Card className="gap-2 px-4 py-4">
      <h2 className="text-lg font-semibold">{t("opr.title")}</h2>
      {body}
    </Card>
  );
}
