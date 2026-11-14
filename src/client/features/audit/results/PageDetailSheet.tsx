import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/client/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/client/components/ui/sheet";
import { getAuditIssueCopy } from "@/client/features/audit/issueLabels";
import { IssueDetails } from "@/client/features/audit/results/IssueDetails";
import {
  canonicalDiffers,
  hasTechnicalSignals,
  isAnalyzedPage,
  parseHreflang,
  resolveIssueSeverity,
} from "@/client/features/audit/results/pageInsights";
import type { AuditResultsData } from "@/client/features/audit/results/types";
import {
  HttpStatusBadge,
  LighthouseScoreBadge,
  SeverityBadge,
} from "@/client/features/audit/shared";
import { t } from "@/shared/i18n";

type PageRow = AuditResultsData["pages"][number];
type IssueRow = AuditResultsData["issues"][number];
type LighthouseRow = AuditResultsData["lighthouse"][number];

const DASH = <span className="text-muted-foreground">—</span>;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[9.5rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border px-4 py-3">
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <dl className="divide-y divide-border/50">{children}</dl>
    </section>
  );
}

const text = (value: string | null | undefined): ReactNode =>
  value ? value : DASH;

const yesNo = (value: boolean | null): ReactNode =>
  value === null
    ? DASH
    : value
      ? t("auditDetail.present")
      : t("auditDetail.absent");

function ExternalUrl({ url }: { url: string | null }) {
  if (!url) return DASH;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-start gap-1 break-all text-primary hover:underline"
    >
      {url}
      <ExternalLink className="mt-0.5 size-3 shrink-0" />
    </a>
  );
}

function WithLength({ value }: { value: string | null }) {
  if (!value) return DASH;
  return (
    <>
      {value}{" "}
      <span className="text-xs text-muted-foreground">
        ({t("auditDetail.fieldChars", { count: value.length })})
      </span>
    </>
  );
}

function BasicsSection({ page }: { page: PageRow }) {
  return (
    <Section title={t("auditDetail.sectionBasics")}>
      <Field label={t("auditDetail.fieldStatus")}>
        <HttpStatusBadge code={page.statusCode} />
      </Field>
      <Field label={t("auditDetail.fieldRedirect")}>
        <ExternalUrl url={page.redirectUrl} />
      </Field>
      <Field label={t("auditDetail.fieldFetch")}>{page.fetchClass}</Field>
      <Field label={t("auditDetail.fieldTitle")}>
        <WithLength value={page.title} />
      </Field>
      <Field label={t("auditDetail.fieldMetaDescription")}>
        <WithLength value={page.metaDescription} />
      </Field>
      <Field label={t("auditDetail.fieldResponse")}>
        {page.responseTimeMs ? `${page.responseTimeMs} ms` : DASH}
      </Field>
      <Field label={t("auditDetail.fieldHtmlSize")}>
        {page.htmlBytes === null
          ? DASH
          : `${Math.round(page.htmlBytes / 1024)} KB`}
      </Field>
    </Section>
  );
}

function IndexingSection({ page }: { page: PageRow }) {
  return (
    <Section title={t("auditDetail.sectionIndexing")}>
      <Field label={t("auditDetail.fieldIndexable")}>
        {page.isIndexable
          ? t("auditDetail.indexable")
          : t("auditDetail.noindex")}
      </Field>
      <Field label={t("auditDetail.fieldRobots")}>
        {text(page.robotsMeta)}
      </Field>
      <Field label={t("auditDetail.fieldXRobots")}>
        {text(page.xRobotsTag)}
      </Field>
      <Field label={t("auditDetail.fieldCanonical")}>
        <span className={canonicalDiffers(page) ? "text-warning" : undefined}>
          {text(page.canonicalUrl)}
        </span>
      </Field>
      <Field label={t("auditDetail.fieldHeaderCanonical")}>
        {text(page.headerCanonicalUrl)}
      </Field>
    </Section>
  );
}

function SocialSection({ page }: { page: PageRow }) {
  return (
    <Section title={t("auditDetail.sectionSocial")}>
      <Field label={t("auditDetail.fieldOgTitle")}>{text(page.ogTitle)}</Field>
      <Field label={t("auditDetail.fieldOgDescription")}>
        {text(page.ogDescription)}
      </Field>
      <Field label={t("auditDetail.fieldOgImage")}>
        <ExternalUrl url={page.ogImage} />
      </Field>
      <Field label={t("auditDetail.fieldTwitterCard")}>
        {text(page.twitterCard)}
      </Field>
    </Section>
  );
}

function ContentSection({ page }: { page: PageRow }) {
  const headings = [
    page.h1Count,
    page.h2Count,
    page.h3Count,
    page.h4Count,
    page.h5Count,
    page.h6Count,
  ]
    .map((count, index) => `H${index + 1}: ${count}`)
    .join(" · ");
  return (
    <Section title={t("auditDetail.sectionContent")}>
      <Field label={t("auditDetail.fieldWords")}>{page.wordCount}</Field>
      <Field label={t("auditDetail.fieldHeadings")}>{headings}</Field>
      <Field label={t("auditDetail.fieldImages")}>
        {page.imagesMissingAlt}/{page.imagesTotal}
      </Field>
    </Section>
  );
}

function LinksSection({ page }: { page: PageRow }) {
  return (
    <Section title={t("auditDetail.sectionLinks")}>
      <Field label={t("auditDetail.fieldInternalLinks")}>
        {page.internalLinkCount}
      </Field>
      <Field label={t("auditDetail.fieldExternalLinks")}>
        {page.externalLinkCount}
      </Field>
      <Field label={t("auditDetail.fieldInlinks")}>
        {page.inlinkCount ?? DASH}
      </Field>
      <Field label={t("auditDetail.fieldDepth")}>
        {page.crawlDepth ?? DASH}
      </Field>
      <Field label={t("auditDetail.fieldInSitemap")}>
        {page.inSitemap ? t("common.yes") : t("common.no")}
      </Field>
    </Section>
  );
}

function TechnicalSection({ page }: { page: PageRow }) {
  const hreflang = parseHreflang(page.hreflangJson);
  const jsonLd =
    page.jsonLdCount === null
      ? DASH
      : page.jsonLdInvalidCount
        ? t("auditDetail.jsonLdInvalid", { count: page.jsonLdInvalidCount })
        : String(page.jsonLdCount);
  return (
    <Section title={t("auditDetail.sectionTechnical")}>
      <Field label={t("auditDetail.fieldLang")}>{text(page.htmlLang)}</Field>
      <Field label={t("auditDetail.fieldViewport")}>
        {yesNo(page.hasViewport)}
      </Field>
      <Field label={t("auditDetail.fieldJsonLd")}>{jsonLd}</Field>
      <Field label={t("auditDetail.fieldMixedContent")}>
        {page.mixedContentCount ?? DASH}
      </Field>
      <Field label={t("auditDetail.fieldHreflang")}>
        {hreflang === null
          ? DASH
          : hreflang.length > 0
            ? hreflang.join(", ")
            : "—"}
      </Field>
    </Section>
  );
}

function IssuesSection({ issues }: { issues: IssueRow[] }) {
  return (
    <section className="border-t border-border px-4 py-3">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("auditDetail.sectionIssues", { count: issues.length })}
      </h3>
      {issues.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("auditDetail.sectionNoIssues")}
        </p>
      ) : (
        <ul className="space-y-3">
          {issues.map((issue) => {
            const copy = getAuditIssueCopy(issue.issueType);
            return (
              <li
                key={issue.id}
                className="rounded-lg border border-border p-3 text-sm"
              >
                <div className="mb-1 flex items-center gap-2">
                  <SeverityBadge severity={resolveIssueSeverity(issue)}>
                    {copy.title}
                  </SeverityBadge>
                </div>
                <IssueDetails detailsJson={issue.detailsJson} />
                {copy.explanation ? (
                  <p className="mt-1 text-muted-foreground">
                    {copy.explanation}
                  </p>
                ) : null}
                {copy.howToFix ? (
                  <p className="mt-1">
                    <span className="font-medium">
                      {t("auditDetail.howToFix")}{" "}
                    </span>
                    <span className="text-foreground/80">{copy.howToFix}</span>
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function LighthouseSection({
  results,
  projectId,
  auditId,
}: {
  results: LighthouseRow[];
  projectId: string;
  auditId: string;
}) {
  if (results.length === 0) return null;
  return (
    <section className="border-t border-border px-4 py-3">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("auditDetail.sectionLighthouse")}
      </h3>
      <ul className="space-y-2">
        {results.map((result) => (
          <li
            key={result.id}
            className="flex flex-wrap items-center gap-2 text-sm"
          >
            <span className="w-16 capitalize">{result.strategy}</span>
            <span className="text-xs text-muted-foreground">Perf</span>
            <LighthouseScoreBadge score={result.performanceScore} />
            <span className="text-xs text-muted-foreground">A11y</span>
            <LighthouseScoreBadge score={result.accessibilityScore} />
            <span className="text-xs text-muted-foreground">SEO</span>
            <LighthouseScoreBadge score={result.seoScore} />
            {result.r2Key ? (
              <Button
                size="xs"
                variant="ghost"
                nativeButton={false}
                render={
                  <Link
                    to="/p/$projectId/audit/issues/$resultId"
                    params={{ projectId, resultId: result.id }}
                    search={{ auditId, category: "performance" }}
                  />
                }
              >
                {t("auditDetail.lighthouseOpen")}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Right-hand panel with everything the crawler recorded about one page. */
export function PageDetailSheet({
  page,
  issues,
  lighthouse,
  projectId,
  auditId,
  onClose,
}: {
  page: PageRow | null;
  issues: IssueRow[];
  lighthouse: LighthouseRow[];
  projectId: string;
  auditId: string;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={page !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {page ? (
          <>
            <SheetHeader className="pr-12">
              <SheetTitle>{t("auditDetail.detailTitle")}</SheetTitle>
              <SheetDescription className="break-all">
                <ExternalUrl url={page.url} />
              </SheetDescription>
            </SheetHeader>
            {isAnalyzedPage(page) && !hasTechnicalSignals(page) ? (
              <p className="mx-4 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                {t("auditDetail.detailOldAudit")}
              </p>
            ) : null}
            <BasicsSection page={page} />
            <IssuesSection issues={issues} />
            <IndexingSection page={page} />
            <SocialSection page={page} />
            <ContentSection page={page} />
            <LinksSection page={page} />
            <TechnicalSection page={page} />
            <LighthouseSection
              results={lighthouse.filter((row) => row.pageId === page.id)}
              projectId={projectId}
              auditId={auditId}
            />
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
