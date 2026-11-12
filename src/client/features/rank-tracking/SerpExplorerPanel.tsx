import { isFreeRankSource } from "@/shared/rank-tracking";
import { useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Search } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getSerpAnalysis } from "@/serverFunctions/keywords";
import { safeHttpUrl } from "@/shared/safe-url";
import { t } from "@/shared/i18n";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";

export function SerpExplorerPanel({
  config,
  projectId,
}: {
  config: RankTrackingConfig;
  projectId: string;
}) {
  const [keyword, setKeyword] = useState("");
  const [submittedKeyword, setSubmittedKeyword] = useState("");
  const query = useQuery({
    queryKey: ["rankSerpExplorer", projectId, config.id, submittedKeyword],
    enabled: Boolean(submittedKeyword),
    queryFn: () =>
      getSerpAnalysis({
        data: {
          projectId,
          keyword: submittedKeyword,
          locationCode: config.locationCode,
          languageCode: config.languageCode,
          locationName: config.locationName ?? undefined,
          depth: 20,
        },
      }),
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = keyword.trim();
    if (!normalized) return;
    if (normalized === submittedKeyword) {
      void query.refetch();
    } else {
      setSubmittedKeyword(normalized);
    }
  };

  return (
    <details className="mx-4 mb-3 rounded-lg border border-border">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
        {t("rank.serpExplorer")}
      </summary>
      <div className="space-y-3 border-t border-border p-3">
        <form className="flex gap-2" onSubmit={handleSubmit}>
          <Input
            aria-label={t("rank.serpExplorer")}
            placeholder={t("rank.enterKeywordToSearch")}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            pending={query.isFetching}
            disabled={!keyword.trim()}
          >
            <Search data-icon="inline-start" />
            {t("rank.searchSerp")}
          </Button>
        </form>

        {query.error ? (
          <p role="alert" className="text-sm text-destructive">
            {getStandardErrorMessage(query.error)}
          </p>
        ) : null}

        {query.data ? (
          <>
            <p className="text-xs text-muted-foreground">
              {query.data.sourceProvider === "serpapi"
                ? "SerpApi"
                : query.data.sourceProvider === "openserp"
                  ? "OpenSERP"
                  : "DataForSEO"}
              {isFreeRankSource(query.data.sourceProvider)
                ? ` · ${t("rank.marketHint")}: ${query.data.marketHint}`
                : ""}
              {" · "}
              {t("rank.resultsUpdatedAt", {
                time: new Date(query.data.fetchedAt).toLocaleString(),
              })}
            </p>
            {query.data.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("rank.noOrganicResults")}
              </p>
            ) : (
              <ol className="divide-y divide-border">
                {query.data.items.map((item, index) => {
                  const safeUrl = safeHttpUrl(item.url);
                  return (
                    <li
                      key={`${item.url}:${index}`}
                      className="flex gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="shrink-0 text-right font-mono text-xs text-muted-foreground">
                        <div>
                          {t("rank.organicRank")}: {item.rank}
                        </div>
                        <div>
                          {t("rank.absolutePosition")}:{" "}
                          {item.absolutePosition ?? "—"}
                        </div>
                      </div>
                      <div className="min-w-0">
                        {safeUrl ? (
                          <a
                            href={safeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex max-w-full items-center gap-1 font-medium text-primary hover:underline"
                          >
                            <span className="truncate">
                              {item.title || item.url}
                            </span>
                            <ExternalLink className="size-3 shrink-0" />
                          </a>
                        ) : (
                          <span className="font-medium">
                            {item.title || item.url}
                          </span>
                        )}
                        <p className="truncate text-xs text-muted-foreground">
                          {item.domain}
                        </p>
                        {item.description ? (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {item.description}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </>
        ) : null}
      </div>
    </details>
  );
}
