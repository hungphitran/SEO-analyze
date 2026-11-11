import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { Info, TriangleAlert } from "lucide-react";
import { Alert, AlertTitle } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Card } from "@/client/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/client/components/ui/tooltip";
import { DomainLevelBadge } from "@/client/features/ai-search/components/DomainLevelBadge";
import { BrandLookupMentionTrendCard } from "@/client/features/ai-search/components/BrandLookupMentionTrendCard";
import { BrandLookupShareOfVoice } from "@/client/features/ai-search/components/BrandLookupShareOfVoice";
import { CitationTabsCard } from "@/client/features/ai-search/components/BrandLookupCitationsCard";
import {
  formatCount,
  formatPlatformLabel,
  PLATFORM_DOT_CLASS,
} from "@/client/features/ai-search/platformLabels";
import type { BrandLookupResult } from "@/types/schemas/ai-search";
import { RESEARCH_SCOPE_LABELS } from "@/shared/researchScope";
import { t } from "@/shared/i18n";

type Props = {
  result: BrandLookupResult;
  projectId: string;
};

const DOMAIN_LEVEL_TIP =
  t("search.mentionsPerDomain");

export function BrandLookupResults({ result, projectId }: Props) {
  if (!result.hasData) {
    const erroredPlatforms = result.perPlatform.filter(
      (p) => p.status === "error",
    );
    const allPlatformsErrored =
      erroredPlatforms.length === result.perPlatform.length &&
      result.perPlatform.length > 0;

    if (allPlatformsErrored) {
      return (
        <Alert variant="warning">
          <TriangleAlert aria-hidden />
          <AlertTitle className="font-normal">
            {t("ui.aiMentionDataIsTemporarilyUnavailable")}{" "}
            <strong>{result.resolvedTarget}</strong>{t("ui.pleaseTryAgainShortly")}
          </AlertTitle>
        </Alert>
      );
    }
    return (
      <div className="space-y-3">
        <Alert variant="info">
          <Info aria-hidden />
          <AlertTitle className="font-normal">
            {t("ui.noAiMentionsFoundFor")} <strong>{result.resolvedTarget}</strong>.
          </AlertTitle>
        </Alert>
        {erroredPlatforms.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("ui.note")}{" "}
            {erroredPlatforms
              .map((p) => formatPlatformLabel(p.platform))
              .join(` ${t("common.and")} `)}{" "}
            {t("ui.unavailableSomeMentionsMayBeMissing")}
          </p>
        ) : null}
      </div>
    );
  }

  const hasTrendData = result.monthlyVolume.length > 0;
  const sov = result.shareOfVoice;

  return (
    <Card className="gap-0 py-0">
      <BrandHeader result={result} />

      {/* One shared grid so the panels align by construction: stats left,
          trend right, Share of Voice flowing into the next free half-width
          cell — whichever of trend/SoV is absent, the rest stay
          column-aligned. A lone stats panel keeps full width instead of half a
          grid. */}
      <div
        className={
          hasTrendData || sov
            ? "grid gap-3 px-4 pb-4 lg:grid-cols-2"
            : "px-4 pb-4"
        }
      >
        <StatsCard result={result} />
        {hasTrendData ? <MentionTrendCard result={result} /> : null}
        {sov ? (
          <BrandLookupShareOfVoice
            shareOfVoice={sov}
            isDomainLevel={result.aggregatesAreDomainLevel}
          />
        ) : null}
      </div>

      <div className="px-4 pb-4">
        <CitationTabsCard result={result} projectId={projectId} />
      </div>
    </Card>
  );
}

function BrandHeader({ result }: { result: BrandLookupResult }) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold break-all">
          {result.resolvedTarget}
        </h2>
        <Badge variant="secondary">{result.detectedTargetType}</Badge>
        {result.scope ? (
          <Badge variant="outline">{RESEARCH_SCOPE_LABELS[result.scope]}</Badge>
        ) : null}
      </div>
      <p className="ml-auto text-xs text-muted-foreground">{t("ui.updated", { v0: formatRelative(result.fetchedAt) })}</p>
    </section>
  );
}

function StatsCard({ result }: { result: BrandLookupResult }) {
  return (
    <div className="w-full max-w-xl rounded-lg border border-border p-3">
      {result.aggregatesAreDomainLevel && (
        <div className="mb-2">
          <DomainLevelBadge tooltip={DOMAIN_LEVEL_TIP} />
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("search.platform")}</TableHead>
            <TableHead className="text-right">
              <span className="inline-flex items-center gap-1">
                {t("search.mentions")}
                <InfoTooltip text={t("search.answersMentionBrand")} />
              </span>
            </TableHead>
            <TableHead className="text-right">
              <span className="inline-flex items-center gap-1">
                {t("search.aiSearchVolume")}
                <InfoTooltip text={t("search.monthlyPromptDemand")} />
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow className="font-medium">
            <TableCell>{t("common.total")}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCount(result.totalMentions)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCount(result.totalAiSearchVolume)}
            </TableCell>
          </TableRow>
          {result.perPlatform.map((row) => (
            <TableRow key={row.platform}>
              <TableCell>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={`size-1.5 rounded-full ${PLATFORM_DOT_CLASS[row.platform]}`}
                  />
                  {formatPlatformLabel(row.platform)}
                  {row.platform === "chat_gpt" && (
                    <InfoTooltip text={t("search.chatgptUsOnly")} />
                  )}
                  {row.status === "error" && (
                    <span className="text-destructive">{t("common.unavailable")}</span>
                  )}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCount(row.status === "error" ? null : row.mentions)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCount(
                  row.status === "error" ? null : row.aiSearchVolume,
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function MentionTrendCard({ result }: { result: BrandLookupResult }) {
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">{t("search.mentionTrend")}</h3>
        {result.aggregatesAreDomainLevel ? (
          <DomainLevelBadge tooltip={DOMAIN_LEVEL_TIP} />
        ) : null}
      </div>
      <div className="p-4">
        <BrandLookupMentionTrendCard result={result} />
      </div>
    </div>
  );
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        delay={150}
        aria-label={t("search.moreInfo")}
        className="inline-flex rounded-sm text-muted-foreground/70 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Info className="size-3" />
      </TooltipTrigger>
      <TooltipContent className="normal-case tracking-normal font-normal">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return t("ui.justNow");

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return t("ui.justNow");
  if (diffMin < 60) return t("ui.mAgo", { v0: diffMin });
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return t("ui.hAgo", { v0: diffHr });
  const diffDay = Math.floor(diffHr / 24);
  return t("ui.dAgo", { v0: diffDay });
}
