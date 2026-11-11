import { projectsQueryOptions } from "@/client/features/projects/projectQueries";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { revalidateLogic } from "@tanstack/react-form";
import { toast } from "sonner";
import { z } from "zod";
import { useAppForm } from "@/client/components/form/useAppForm";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { FieldDescription } from "@/client/components/ui/field";
import { setLastProjectId } from "@/client/lib/active-project";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import {
  DEFAULT_LOCATION_CODE,
  getLanguageCode,
} from "@/client/features/keywords/locations";
import { ProjectMarketFields } from "@/client/features/projects/ProjectMarketFields";
import { toastInitialAudit } from "@/client/features/projects/initialAuditToast";
import { createProject } from "@/serverFunctions/projects";
import { isEveryAppClientAuthMode } from "@/lib/auth-mode";
import { t } from "@/shared/i18n";

const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required"),
  domain: z.string(),
  market: z.object({ locationCode: z.number(), languageCode: z.string() }),
});

// The server sends only the error code, so the field messages live here.
const SERVER_FIELD_ERRORS: Record<string, Record<string, string>> = {
  VALIDATION_ERROR: { domain: t("ui.enterAValidDomainLikeAcme") },
  CONFLICT: {
    name: t("ui.aProjectNamedDefaultWithNo"),
  },
};

export function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (values: z.infer<typeof createProjectSchema>) =>
      createProject({
        data: {
          name: values.name.trim(),
          domain: values.domain.trim() || undefined,
          ...values.market,
        },
      }),
    // The form shows field errors inline and toasts the rest itself.
    meta: { errorToast: false },
    onSuccess: async (created) => {
      setLastProjectId(created.id);
      await queryClient.invalidateQueries({
        queryKey: projectsQueryOptions().queryKey,
      });
      await queryClient.invalidateQueries({
        queryKey: ["dashboardActivation"],
      });
      onClose();
      toast.success(t("ui.projectCreated"));
      toastInitialAudit(created.initialAudit);
      // Continue setup through the new project’s dashboard.
      void navigate({
        to: "/p/$projectId",
        params: { projectId: created.id },
      });
    },
  });

  const form = useAppForm({
    defaultValues: {
      name: "",
      domain: "",
      market: {
        locationCode: DEFAULT_LOCATION_CODE,
        languageCode: getLanguageCode(DEFAULT_LOCATION_CODE),
      },
    },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: createProjectSchema },
    onSubmit: async ({ value, formApi }) => {
      try {
        await createMutation.mutateAsync(value);
      } catch (error) {
        const fields = SERVER_FIELD_ERRORS[getErrorCode(error) ?? ""];
        if (fields) {
          formApi.setErrorMap({ onSubmit: { fields } });
        } else {
          toast.error(getStandardErrorMessage(error));
        }
      }
    },
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !createMutation.isPending) onClose();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <form.AppForm>
          <form.Form className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{t("ui.newProject")}</DialogTitle>
            </DialogHeader>

            <form.AppField name="name">
              {(field) => (
                <field.TextField
                  label={t("ui.name")}
                  placeholder={t("ui.acmeInc")}
                  maxLength={120}
                  required
                />
              )}
            </form.AppField>

            <p className="text-sm text-muted-foreground">
              {isEveryAppClientAuthMode()
                ? t("ui.addingYourWebsiteStartsA50")
                : t("ui.addingYourWebsiteStartsA50_06bf")}
            </p>
            <form.AppField name="domain">
              {(field) => (
                <field.TextField
                  label={
                    <>
                      {t("ui.domain")}{" "}
                      <span className="font-normal text-muted-foreground">
                        {t("ui.optional")}
                      </span>
                    </>
                  }
                  description={t("ui.youCanConnectSearchConsoleAnd")}
                  placeholder="example.com"
                  maxLength={255}
                />
              )}
            </form.AppField>

            <div className="flex flex-col gap-2">
              <form.Field name="market">
                {(field) => (
                  <ProjectMarketFields
                    value={field.state.value}
                    onChange={field.handleChange}
                  />
                )}
              </form.Field>
              <FieldDescription>
                {t("ui.keywordSerpAndDomainDataUses")}
              </FieldDescription>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={createMutation.isPending}
              >
                {t("common.cancel")}
              </Button>
              <form.SubmitButton>{t("ui.createProject")}</form.SubmitButton>
            </DialogFooter>
          </form.Form>
        </form.AppForm>
      </DialogContent>
    </Dialog>
  );
}
