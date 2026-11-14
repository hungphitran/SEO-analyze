import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ChevronRight, CircleCheck, CircleX, Download } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { revalidateLogic } from "@tanstack/react-form";
import { useAppForm } from "@/client/components/form/useAppForm";
import { CardShell } from "@/client/components/CardShell";
import { QueryError } from "@/client/components/QueryState";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import { CopyButton } from "@/client/components/CopyButton";
import { Button } from "@/client/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/client/components/ui/collapsible";
import {
  checkIndexNowKeyFiles,
  getIndexNowSetup,
  setUpIndexNow,
  submitIndexNowUrls,
} from "@/serverFunctions/indexnow";
import { t } from "@/shared/i18n";

const urlsSchema = z.object({
  urls: z
    .string()
    .refine((value) => splitUrls(value).length > 0, t("indexNow.enterUrl")),
});

function splitUrls(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

const AGENT_PROMPT = () => t("indexNow.agentPrompt");

type KeyFileHost = Awaited<
  ReturnType<typeof checkIndexNowKeyFiles>
>["hosts"][number];

const KEY_FILE_LABELS = (): Record<KeyFileHost["status"], string> => ({
  found: t("indexNow.found"),
  missing: t("indexNow.notFound"),
  wrong_content: t("indexNow.shouldContainOnlyKey"),
  redirects: t("indexNow.redirectsSelf"),
  moved: t("indexNow.redirectsOther"),
  unreachable: t("indexNow.unreachable"),
  unknown: t("indexNow.couldNotCheck"),
});

// A host that forwards to another one or doesn't load has no pages to
// submit, so it doesn't need the file.
const isUnused = (host: KeyFileHost) =>
  host.status === "moved" || host.status === "unreachable";

function downloadKeyFile(key: string) {
  const url = URL.createObjectURL(new Blob([key], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${key}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * IndexNow tells Bing and the other participating engines which pages
 * changed. The site proves ownership by hosting the project's key file.
 */
export function IndexNowSettings({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const setupQueryKey = ["indexnow-setup", projectId];
  const setupQuery = useQuery({
    queryKey: setupQueryKey,
    queryFn: () => getIndexNowSetup({ data: { projectId } }),
    // Website edits elsewhere don't invalidate this, so refetch on each visit.
    staleTime: 0,
  });

  const setUpMutation = useMutation({
    mutationFn: () => setUpIndexNow({ data: { projectId } }),
    onSuccess: (setup) => queryClient.setQueryData(setupQueryKey, setup),
  });

  const keyFilesQueryKey = ["indexnow-key-files", projectId];
  const hasKey = Boolean(setupQuery.data?.domain && setupQuery.data.key);
  const keyFilesQuery = useQuery({
    queryKey: keyFilesQueryKey,
    queryFn: () => checkIndexNowKeyFiles({ data: { projectId } }),
    enabled: hasKey,
  });

  const submitMutation = useMutation({
    mutationFn: (urls: string[]) =>
      submitIndexNowUrls({ data: { projectId, urls } }),
  });

  const form = useAppForm({
    defaultValues: { urls: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: urlsSchema },
    onSubmit: async ({ value, formApi }) => {
      const result = await submitMutation.mutateAsync(splitUrls(value.urls));
      const failed = result.hosts.filter((host) => host.status === "failed");
      const sent = result.hosts
        .filter((host) => host.status === "submitted")
        .reduce((count, host) => count + host.urlCount, 0);

      for (const host of failed) {
        toast.error(t("indexNow.couldNotSubmit"), {
          description: host.message,
          duration: 10_000,
        });
      }
      if (sent > 0) toast.success(t("indexNow.submitted", { count: sent }));
      if (result.skipped.length > 0) {
        toast.warning(
          t("indexNow.skippedNotOn", {
            count: result.skipped.length,
            domain: setupQuery.data?.domain ?? "",
          }),
        );
      }
      if (failed.length > 0) {
        void queryClient.invalidateQueries({ queryKey: keyFilesQueryKey });
      }
      if (failed.length === 0 && sent > 0) formApi.reset();
    },
  });

  if (setupQuery.isError) {
    return (
      <section id="indexnow" className="scroll-mt-6">
        <CardShell title="IndexNow">
          <QueryError
            error={setupQuery.error}
            fallback={t("indexNow.couldNotLoad")}
            onRetry={() => void setupQuery.refetch()}
            isRetrying={setupQuery.isFetching}
          />
        </CardShell>
      </section>
    );
  }
  if (!setupQuery.data) return null;
  const { domain, key } = setupQuery.data;

  return (
    <section id="indexnow" className="scroll-mt-6">
      <CardShell title="IndexNow">
        <div className="flex flex-1 flex-col gap-4 text-sm">
          <p className="text-muted-foreground">{t("indexNow.intro")}</p>
          {!domain ? (
            <p className="text-muted-foreground">
              {t("indexNow.addWebsiteFirst")}
            </p>
          ) : !key ? (
            <div className="mt-auto flex justify-end">
              <Button
                variant="outline"
                size="sm"
                pending={setUpMutation.isPending}
                onClick={() => setUpMutation.mutate()}
              >
                {t("indexNow.setUp")}
              </Button>
            </div>
          ) : (
            <ol className="space-y-5">
              <KeyFileStep
                domain={domain}
                indexNowKey={key}
                hosts={keyFilesQuery.data?.hosts}
                isChecking={keyFilesQuery.isFetching}
                onCheck={() => void keyFilesQuery.refetch()}
              />
              <Step number={2} title={t("indexNow.submitWhenPublish")}>
                <p className="text-muted-foreground">
                  {t("indexNow.pasteChangedOnly")}
                </p>
                <form.AppForm>
                  <form.Form className="space-y-3">
                    <form.AppField name="urls">
                      {(field) => (
                        <field.TextareaField
                          label={
                            <span className="text-xs font-normal text-muted-foreground">
                              {t("indexNow.urlsLabel")}
                            </span>
                          }
                          placeholder={`https://${domain}/new-page`}
                          className="min-h-28 font-mono text-xs"
                        />
                      )}
                    </form.AppField>
                    <form.SubmitButton>
                      {t("indexNow.submit")}
                    </form.SubmitButton>
                  </form.Form>
                </form.AppForm>
                <div className="space-y-1 rounded-md bg-muted/50 p-3 text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>
                      {t("indexNow.orAskAgent")}{" "}
                      <span className="text-foreground">
                        "{AGENT_PROMPT()}"
                      </span>
                    </span>
                    <CopyButton
                      value={AGENT_PROMPT()}
                      successMessage={t("indexNow.promptCopied")}
                      size="icon-xs"
                      variant="ghost"
                      label={t("indexNow.copyPrompt")}
                    />
                  </div>
                  <p className="text-xs">{t("indexNow.agentCanAddFile")}</p>
                </div>
              </Step>
            </ol>
          )}
        </div>
      </CardShell>
    </section>
  );
}

function KeyFileStep({
  domain,
  indexNowKey,
  hosts,
  isChecking,
  onCheck,
}: {
  domain: string;
  indexNowKey: string;
  hosts: KeyFileHost[] | undefined;
  isChecking: boolean;
  onCheck: () => void;
}) {
  const used = hosts?.filter((host) => !isUnused(host)) ?? [];
  // Until the check answers, list both addresses without a status.
  const shown: { host: string; status?: KeyFileHost["status"] }[] = !hosts
    ? [{ host: domain }, { host: `www.${domain}` }]
    : used.length > 0
      ? used
      : hosts;
  const verified =
    used.length > 0 && used.every((host) => host.status === "found");

  return (
    <Step
      number={1}
      title={verified ? t("indexNow.keyFileReady") : t("indexNow.addKeyFile")}
    >
      {verified ? null : (
        <>
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => downloadKeyFile(indexNowKey)}
          >
            <Download className="size-4" />
            {t("indexNow.downloadKeyFile")}
          </Button>
          <p className="text-muted-foreground">{t("indexNow.putAtRoot")}</p>
        </>
      )}
      <ul className="space-y-1">
        {shown.map((host) => (
          <li
            key={host.host}
            className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
          >
            <SafeExternalLink
              url={`https://${host.host}/${indexNowKey}.txt`}
              label={`https://${host.host}/${indexNowKey}.txt`}
              className="inline-flex items-center gap-1 font-mono text-xs break-all text-foreground underline underline-offset-2"
            />
            {host.status ? <KeyFileStatus status={host.status} /> : null}
          </li>
        ))}
      </ul>
      <Button
        variant="outline"
        size="xs"
        className="w-fit"
        pending={isChecking}
        onClick={onCheck}
      >
        {t("indexNow.checkAgain")}
      </Button>
      {verified ? null : (
        <Collapsible>
          <CollapsibleTrigger className="group inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ChevronRight
              className="size-3.5 transition-transform group-data-[panel-open]:rotate-90"
              aria-hidden
            />
            {t("indexNow.howAddFile")}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                {t("indexNow.helpCode", { public: "public", static: "static" })}
              </li>
              <li>{t("indexNow.helpWp", { wpconfig: "wp-config.php" })}</li>
              <li>{t("indexNow.helpCf")}</li>
              <li>{t("indexNow.helpBuilders")}</li>
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </Step>
  );
}

function KeyFileStatus({ status }: { status: KeyFileHost["status"] }) {
  const problem =
    status === "missing" ||
    status === "wrong_content" ||
    status === "redirects";
  const Icon = status === "found" ? CircleCheck : problem ? CircleX : undefined;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${status === "found" ? "text-success" : problem ? "text-destructive" : "text-muted-foreground"}`}
    >
      {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
      {KEY_FILE_LABELS()[status]}
    </span>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
        {number}
      </span>
      <div className="min-w-0 flex-1 space-y-2 pt-0.5">
        <p className="font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
}
