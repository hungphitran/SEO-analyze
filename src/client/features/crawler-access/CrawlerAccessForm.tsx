import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { revalidateLogic } from "@tanstack/react-form";
import { useAppForm } from "@/client/components/form/useAppForm";
import { useAuditCapabilities } from "@/client/features/audit/shared";
import { isEveryAppClientAuthMode } from "@/lib/auth-mode";
import { saveCrawlerCredential } from "@/serverFunctions/crawlerAccess";
import {
  isCrawlerAccessExpired,
  parseSignatureExpiry,
} from "@/shared/crawler-access";
import { t } from "@/shared/i18n";

export const crawlerCredentialsQueryKey = ["crawler-credentials"];
export const saveCrawlerCredentialMutationKey = ["save-crawler-credential"];

/**
 * On Every App, CRAWLER_ACCESS_SECRET is optional, so the form and the Shopify
 * crawl warning say how to set it instead of failing on save.
 */
export function CrawlerAccessSetupHint() {
  return (
    <>
      {t("crawler.setupHintPrefix")} <code>CRAWLER_ACCESS_SECRET</code>{" "}
      {t("crawler.setupHintWith")}{" "}
      <code>pnpm everyapp secret set CRAWLER_ACCESS_SECRET --app openseo</code>.
    </>
  );
}

/** Whether to show the setup hint: only behind Every App, once known. */
export function useCrawlerAccessNeedsSetup(projectId: string) {
  const canStore = useAuditCapabilities(projectId).data?.canStoreCrawlerAccess;
  return isEveryAppClientAuthMode() && canStore === false;
}

const signatureSchema = z.object({
  host: z.string().trim().min(1, t("crawler.enterDomain")),
  signatureInput: z
    .string()
    .trim()
    .min(1, t("crawler.enterSignatureInput"))
    .refine(
      (value) => !isCrawlerAccessExpired(parseSignatureExpiry(value)),
      t("crawler.signatureExpired"),
    ),
  signature: z.string().trim().min(1, t("crawler.enterSignature")),
});

/**
 * The two values a merchant copies out of Shopify admin. `Signature-Agent` is
 * a constant we add ourselves, so it is not asked for here.
 */
export function CrawlerAccessForm({
  projectId,
  initialHost,
  lockHost = false,
  onSaved,
}: {
  /** The project (website) the signature is stored on. */
  projectId: string;
  initialHost: string;
  lockHost?: boolean;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationKey: saveCrawlerCredentialMutationKey,
    mutationFn: (values: z.infer<typeof signatureSchema>) =>
      saveCrawlerCredential({
        data: { projectId, ...values },
      }),
    onSuccess: async (result) => {
      if ("problem" in result) return;
      await queryClient.invalidateQueries({
        queryKey: crawlerCredentialsQueryKey,
      });
      toast.success(t("crawler.savedFor", { host: result.credential.host }));
      onSaved?.();
    },
  });

  const form = useAppForm({
    defaultValues: { host: initialHost, signatureInput: "", signature: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: signatureSchema },
    onSubmit: async ({ value, formApi }) => {
      const result = await saveMutation.mutateAsync(value);
      if ("problem" in result) {
        const { problem } = result;
        formApi.setErrorMap({
          onSubmit: {
            fields: {
              signatureInput:
                problem.reason === "wrong_domain"
                  ? t("crawler.wrongDomain", { signedHost: problem.signedHost, host: problem.host })
                  : t("crawler.shopifyWontAccept", { host: problem.host }),
            },
          },
        });
        return;
      }
      formApi.reset({ ...value, signatureInput: "", signature: "" });
    },
  });

  if (useCrawlerAccessNeedsSetup(projectId)) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("crawler.notSetUp")} <CrawlerAccessSetupHint />
      </p>
    );
  }

  return (
    <form.AppForm>
      <form.Form className="space-y-3">
        {!lockHost ? (
          <form.AppField name="host">
            {(field) => (
              <field.TextField
                label={t("common.domain")}
                placeholder="store.example.com"
                className="font-mono"
                required
              />
            )}
          </form.AppField>
        ) : null}
        <form.AppField name="signatureInput">
          {(field) => (
            <field.TextField
              label="Signature-Input"
              type="password"
              autoComplete="off"
              data-ph-mask
              className="font-mono"
              placeholder="sig1=(...);expires=..."
              required
            />
          )}
        </form.AppField>
        <form.AppField name="signature">
          {(field) => (
            <field.TextField
              label={t("ui.signature")}
              description={t("crawler.signatureDesc")}
              type="password"
              autoComplete="off"
              data-ph-mask
              className="font-mono"
              placeholder="sig1=:...:"
              required
            />
          )}
        </form.AppField>
        <form.SubmitButton disabled={!projectId}>
          {t("crawler.saveSignature")}
        </form.SubmitButton>
      </form.Form>
    </form.AppForm>
  );
}
