import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { GoogleConnectionCard } from "@/client/features/integrations/GoogleConnectionCard";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import { inspectGscUrl } from "@/serverFunctions/searchConsoleDetail";
import { t } from "@/shared/i18n";
import { verdictTone, type VerdictTone } from "./inspectionVerdict";

type InspectionResponse = Awaited<ReturnType<typeof inspectGscUrl>>;
type Inspection = NonNullable<
  Extract<InspectionResponse, { connected: true }>["inspection"]
>;

const TONE_CLASSES: Record<VerdictTone, string> = {
  good: "text-success",
  warn: "text-warning-foreground dark:text-warning",
  bad: "text-destructive",
  neutral: "text-muted-foreground",
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-border/60 py-2 sm:grid-cols-[14rem_1fr]">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="break-words text-sm">{children}</dd>
    </div>
  );
}

function Verdict({ verdict }: { verdict: string | null }) {
  const tone = verdictTone(verdict);
  return (
    <span className={`font-medium ${TONE_CLASSES[tone]}`}>
      {verdict ?? "—"}
    </span>
  );
}

function IssueList({
  issues,
}: {
  issues: { message: string; severity: string | null }[];
}) {
  if (issues.length === 0) return null;
  return (
    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground text-xs">
      {issues.map((issue, index) => (
        <li key={`${issue.message}-${index}`}>
          {issue.severity ? `[${issue.severity}] ` : ""}
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

function value(text: string | null) {
  return text ?? "—";
}

function InspectionDetails({ inspection }: { inspection: Inspection }) {
  return (
    <dl>
      <Row label={t("gscDetail.inspectIndexVerdict")}>
        <Verdict verdict={inspection.verdict} />
      </Row>
      <Row label={t("gscDetail.inspectCoverage")}>
        {value(inspection.coverageState)}
      </Row>
      <Row label={t("gscDetail.inspectIndexing")}>
        {value(inspection.indexingState)}
      </Row>
      <Row label={t("gscDetail.inspectRobots")}>
        {value(inspection.robotsTxtState)}
      </Row>
      <Row label={t("gscDetail.inspectFetch")}>
        {value(inspection.pageFetchState)}
      </Row>
      <Row label={t("gscDetail.inspectLastCrawl")}>
        {inspection.lastCrawlTime
          ? new Date(inspection.lastCrawlTime).toLocaleString("vi-VN")
          : "—"}
      </Row>
      <Row label={t("gscDetail.inspectCrawledAs")}>
        {value(inspection.crawledAs)}
      </Row>
      <Row label={t("gscDetail.inspectGoogleCanonical")}>
        {value(inspection.googleCanonical)}
      </Row>
      <Row label={t("gscDetail.inspectUserCanonical")}>
        {value(inspection.userCanonical)}
        {inspection.canonicalMismatch ? (
          <p className="text-warning-foreground text-xs dark:text-warning">
            {t("gscDetail.inspectCanonicalMismatch")}
          </p>
        ) : null}
      </Row>
      <Row label={t("gscDetail.inspectSitemaps")}>
        {inspection.sitemaps.length > 0 ? inspection.sitemaps.join(", ") : "—"}
      </Row>
      {inspection.referringUrls.length > 0 ? (
        <Row label={t("gscDetail.inspectReferring")}>
          {inspection.referringUrls.join(", ")}
        </Row>
      ) : null}
      <Row label={t("gscDetail.inspectMobile")}>
        {inspection.mobileUsability ? (
          <>
            <Verdict verdict={inspection.mobileUsability.verdict} />
            <IssueList issues={inspection.mobileUsability.issues} />
          </>
        ) : (
          t("gscDetail.inspectNotReturned")
        )}
      </Row>
      <Row label={t("gscDetail.inspectRich")}>
        {inspection.richResults ? (
          <>
            <Verdict verdict={inspection.richResults.verdict} />
            {inspection.richResults.items.map((item) => (
              <div key={item.type} className="mt-1">
                <span className="text-xs">
                  {item.type}
                  {item.names.length > 0 ? `: ${item.names.join(", ")}` : ""}
                </span>
                <IssueList issues={item.issues} />
              </div>
            ))}
          </>
        ) : (
          t("gscDetail.inspectNotReturned")
        )}
      </Row>
      {inspection.amp ? (
        <Row label="AMP">
          <Verdict verdict={inspection.amp.verdict} />
          {inspection.amp.ampUrl ? ` · ${inspection.amp.ampUrl}` : ""}
          <IssueList issues={inspection.amp.issues} />
        </Row>
      ) : null}
      {inspection.reportLink ? (
        <Row label={t("gscDetail.inspectReport")}>
          <SafeExternalLink
            url={inspection.reportLink}
            label={t("gscDetail.inspectOpenGsc")}
            className="inline-flex items-center gap-1 underline underline-offset-2"
          />
        </Row>
      ) : null}
    </dl>
  );
}

/** Inspect one URL of the connected property with Google's URL Inspection API. */
export function SearchInspectionTab({ projectId }: { projectId: string }) {
  const [url, setUrl] = useState("");
  const mutation = useMutation({
    meta: { errorToast: false },
    mutationFn: (inspectionUrl: string) =>
      inspectGscUrl({ data: { projectId, inspectionUrl } }),
  });
  const data = mutation.data;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = url.trim();
    if (trimmed) mutation.mutate(trimmed);
  };

  return (
    <div className="space-y-4 p-4">
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <Input
          className="min-w-64 flex-1"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={t("gscDetail.inspectPlaceholder")}
          aria-label={t("gscDetail.inspectInput")}
          inputMode="url"
        />
        <Button type="submit" disabled={mutation.isPending || !url.trim()}>
          {mutation.isPending
            ? t("gscDetail.inspecting")
            : t("gscDetail.inspectSubmit")}
        </Button>
      </form>
      <p className="text-muted-foreground text-xs">
        {t("gscDetail.inspectHint")}
      </p>

      {mutation.isError ? (
        <QueryError
          error={mutation.error}
          fallback={t("gscDetail.inspectFailed")}
        />
      ) : null}
      {data && !data.connected ? (
        <div className="max-w-2xl">
          <GoogleConnectionCard provider="gsc" projectId={projectId} />
        </div>
      ) : null}
      {data?.connected && data.error ? (
        <p className="text-destructive text-sm" role="alert">
          {t("gscDetail.inspectError", { message: data.error })}
        </p>
      ) : null}
      {data?.connected && data.inspection ? (
        <div className="space-y-2">
          <p className="break-all text-sm">
            <strong>{data.url}</strong>
          </p>
          <InspectionDetails inspection={data.inspection} />
        </div>
      ) : null}
      {data?.connected && !data.error && !data.inspection ? (
        <p className="text-muted-foreground text-sm">
          {t("gscDetail.inspectEmpty")}
        </p>
      ) : null}
      {!data && !mutation.isPending && !mutation.isError ? (
        <p className="text-muted-foreground text-sm">
          {t("gscDetail.inspectIdle")}
        </p>
      ) : null}
    </div>
  );
}
