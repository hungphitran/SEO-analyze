import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MARKDOWN_COMPONENTS } from "@/client/components/Markdown";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/client/components/ui/accordion";
import { Badge } from "@/client/components/ui/badge";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { Button } from "@/client/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/client/components/ui/tabs";
import { getAiVisibilityAnswer } from "@/serverFunctions/ai-visibility";
import {
  aiObservationStatusLabel,
  type AiAnswer,
} from "@/shared/ai-visibility";
import { DomainFavicon } from "./DomainFavicon";
import {
  AiLoading,
  AiMatchBadge,
  AiQueryError,
  aiVisibilityKey,
} from "./shared";
import { t } from "@/shared/i18n";

/** The selected engine's answer lives in the prompt page, beside its sources. */
export function AnswerContent({
  projectId,
  observationId,
}: {
  projectId: string;
  observationId: string;
}) {
  const query = useQuery({
    queryKey: [...aiVisibilityKey(projectId), "answer", observationId],
    queryFn: () =>
      getAiVisibilityAnswer({ data: { projectId, observationId } }),
    staleTime: 0,
  });
  if (query.isPending) return <AiLoading />;
  if (query.isError)
    return (
      <AiQueryError
        error={query.error}
        retry={() => {
          void query.refetch();
        }}
      />
    );
  return <AnswerEvidence answer={query.data} />;
}

function AnswerEvidence({ answer }: { answer: AiAnswer }) {
  const [view, setView] = useState("answer");
  const citations = answer.sources;
  const answered = answer.observation.answerStatus === "answered";
  return (
    <div>
      {answer.observation.answerStatus === "no_answer" && (
        <p className="border-b px-5 py-3 text-sm text-warning border-border">
          {answer.observation.engine === "google_ai_overview"
            ? t("ai.noAiOverview")
            : t("ai.noSubstantive")}{" "}
          {t("ui.thisCollectionIsExcludedFromVisibility")}
        </p>
      )}
      {answer.observation.error && (
        <p
          role="alert"
          className="border-b bg-destructive/5 px-5 py-3 text-sm text-destructive border-border"
        >
          {getStandardErrorMessage(new Error(answer.observation.error))}
        </p>
      )}
      {answer.truncated && (
        <p className="border-b px-5 py-3 text-xs text-warning border-border">
          {t("ui.thisResponseWasTruncatedTheRetained")}
        </p>
      )}
      <div
        className="flex gap-2 border-b px-5 py-3 lg:hidden border-border"
        role="group"
        aria-label={t("ai.answerView")}
      >
        <Button
          size="sm"
          variant={view === "answer" ? "secondary" : "outline"}
          aria-pressed={view === "answer"}
          onClick={() => setView("answer")}
        >
          {t("ui.answer")}
        </Button>
        <Button
          size="sm"
          variant={view === "citations" ? "secondary" : "outline"}
          aria-pressed={view === "citations"}
          onClick={() => setView("citations")}
        >
          {t("ui.citations", { v0: citations.length })}
        </Button>
        <Button
          size="sm"
          variant={view === "brands" ? "secondary" : "outline"}
          aria-pressed={view === "brands"}
          onClick={() => setView("brands")}
        >
          {t("ui.brands_7273")}
        </Button>
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
        <article
          className={`min-w-0 space-y-5 p-5 text-sm sm:p-6 lg:block ${view !== "answer" ? "hidden" : ""}`}
          aria-label={t("ai.aiAnswer")}
          data-ph-mask
        >
          {answer.answerMarkdown ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={ANSWER_COMPONENTS}
            >
              {answer.answerMarkdown}
            </ReactMarkdown>
          ) : answer.answerText ? (
            <div className="whitespace-pre-wrap">{answer.answerText}</div>
          ) : (
            <p className="text-muted-foreground">
              {t("ui.noAnswerWasCapturedStatusThis", {
                v0: aiObservationStatusLabel(answer.observation.status),
              })}
            </p>
          )}
        </article>
        <aside
          className={`min-w-0 bg-muted/20 p-4 lg:block lg:border-l border-border ${view === "answer" ? "hidden" : ""}`}
          aria-label={t("ai.answerEvidence")}
        >
          <Tabs
            value={view === "brands" ? "brands" : "citations"}
            onValueChange={(value: unknown) => {
              if (value === "brands" || value === "citations") setView(value);
            }}
            className="gap-4"
          >
            <TabsList className="hidden w-full lg:flex">
              <TabsTrigger value="citations">
                {t("ui.citations", { v0: citations.length })}
              </TabsTrigger>
              <TabsTrigger value="brands">{t("ai.brands")}</TabsTrigger>
            </TabsList>
            <TabsContent value="citations" className="space-y-3">
              {!citations.length && (
                <p className="text-sm text-muted-foreground">
                  {t("ui.thisAnswerHasNoCitations")}
                </p>
              )}
              {citations.map((source) => (
                <div
                  key={source.url}
                  className="space-y-2 rounded-lg border bg-card p-3 border-border"
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <DomainFavicon domain={source.domain} />
                    <span className="truncate">{source.domain}</span>
                  </div>
                  <SafeExternalLink
                    url={source.url}
                    label={source.title || source.url}
                    className="flex items-start gap-1 break-words text-sm font-medium hover:text-primary hover:underline"
                  />
                </div>
              ))}
            </TabsContent>
            <TabsContent value="brands" className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {t("ui.mentionsAppearInTheAnswerText")}
              </p>
              {!answer.observation.brands.length && (
                <p className="text-sm text-muted-foreground">
                  {t("ui.noBrandEvidenceWasCaptured")}
                </p>
              )}
              {answer.observation.brands.map((brand) => {
                const spans =
                  answer.mentions.find(
                    (mention) => mention.domain === brand.domain,
                  )?.spans ?? [];
                return (
                  <div
                    key={brand.domain}
                    className="space-y-2 rounded-lg border bg-card p-3 border-border"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <DomainFavicon domain={brand.domain} />
                      {brand.name}
                      {brand.own && (
                        <Badge variant="secondary" size="sm">
                          {t("ui.you")}
                        </Badge>
                      )}
                    </div>
                    {answered && (
                      <div className="flex flex-wrap gap-1.5">
                        <AiMatchBadge value={brand.mentioned} />
                        <AiMatchBadge value={brand.cited} positive="Cited" />
                      </div>
                    )}
                    {spans.length > 0 && answer.answerText && (
                      <Accordion>
                        <AccordionItem value="mentions">
                          <AccordionTrigger className="py-1 text-xs">
                            {t("ui.mentionExcerpts", { v0: spans.length })}
                          </AccordionTrigger>
                          <AccordionContent
                            className="space-y-2 pt-2 text-xs text-muted-foreground"
                            data-ph-mask
                          >
                            {spans.map((span, index) => (
                              <p key={`${span.start}-${span.end}-${index}`}>
                                “
                                {answer.answerText!.slice(
                                  Math.max(0, span.start - 70),
                                  span.start,
                                )}
                                <mark className="bg-primary/15 text-foreground">
                                  {answer.answerText!.slice(
                                    span.start,
                                    span.end,
                                  )}
                                </mark>
                                {answer.answerText!.slice(
                                  span.end,
                                  span.end + 70,
                                )}
                                ”
                              </p>
                            ))}
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    )}
                  </div>
                );
              })}
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}

const ANSWER_COMPONENTS = {
  ...MARKDOWN_COMPONENTS,
  img: ({ alt }: { alt?: string }) => (
    <span className="text-muted-foreground">
      {alt ? t("ui.image", { v0: alt }) : t("ui.image_f2b5")}
    </span>
  ),
};
