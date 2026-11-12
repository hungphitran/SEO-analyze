import { ExternalLink } from "lucide-react";
import { safeHttpUrl } from "@/shared/safe-url";
import { t } from "@/shared/i18n";

export function CompetitorOverlapCard({
  overlap,
}: {
  overlap:
    | {
        trackedKeywords: number;
        coveredKeywords: number;
        since: string;
        domains: Array<{
          domain: string;
          keywordsPresent: number;
          appearances: number;
          bestPosition: number;
          averagePosition: number;
          sampleUrls: string[];
        }>;
      }
    | undefined;
}) {
  if (!overlap || overlap.coveredKeywords === 0) return null;

  return (
    <section className="mx-4 mb-3 overflow-hidden rounded-lg border border-border">
      <div className="border-b border-border px-3 py-2">
        <h3 className="text-sm font-semibold">{t("rank.competitorOverlap")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("rank.overlapCoverage", {
            covered: overlap.coveredKeywords,
            tracked: overlap.trackedKeywords,
            since: new Date(overlap.since).toLocaleDateString(),
          })}
        </p>
      </div>
      {overlap.domains.length === 0 ? (
        <p className="p-3 text-sm text-muted-foreground">
          {t("rank.noCompetitorOverlap")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">{t("common.domain")}</th>
                <th className="px-3 py-2 font-medium">
                  {t("rank.keywordsPresent")}
                </th>
                <th className="px-3 py-2 font-medium">
                  {t("rank.serpAppearances")}
                </th>
                <th className="px-3 py-2 font-medium">
                  {t("rank.bestOrganicPosition")}
                </th>
                <th className="px-3 py-2 font-medium">
                  {t("rank.averageOrganicPosition")}
                </th>
                <th className="px-3 py-2 font-medium">
                  {t("rank.sampleUrls")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {overlap.domains.map((competitor) => (
                <tr key={competitor.domain}>
                  <td className="px-3 py-2 font-medium">{competitor.domain}</td>
                  <td className="px-3 py-2">{competitor.keywordsPresent}</td>
                  <td className="px-3 py-2">{competitor.appearances}</td>
                  <td className="px-3 py-2">{competitor.bestPosition}</td>
                  <td className="px-3 py-2">
                    {competitor.averagePosition.toFixed(1)}
                  </td>
                  <td className="max-w-64 px-3 py-2">
                    <div className="flex flex-col gap-1">
                      {competitor.sampleUrls.map((url) => {
                        const safeUrl = safeHttpUrl(url);
                        return safeUrl ? (
                          <a
                            key={url}
                            href={safeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex max-w-full items-center gap-1 truncate text-primary hover:underline"
                          >
                            <span className="truncate">{url}</span>
                            <ExternalLink className="size-3 shrink-0" />
                          </a>
                        ) : (
                          <span key={url} className="truncate">
                            {url}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
