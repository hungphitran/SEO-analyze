import { useMutation, useQueryClient } from "@tanstack/react-query";
import { revalidateLogic } from "@tanstack/react-form";
import { z } from "zod";
import { FormDialog } from "@/client/components/FormDialog";
import { useAppForm } from "@/client/components/form/useAppForm";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { parseKeywordInput } from "@/client/features/keywords/state/keywordControllerActions";
import { updateLocalKeywords } from "@/serverFunctions/local-seo";
import { localKeywordsSchema } from "@/types/schemas/local-seo";
import { t } from "@/shared/i18n";

export const localKeywordsTextSchema = z
  .string()
  .refine(
    (value) => localKeywordsSchema.safeParse(parseKeywordInput(value)).success,
    t("local.keywordLimits"),
  );

export function LocalKeywordsDialog({
  projectId,
  trackerId,
  keywords,
  onClose,
}: {
  projectId: string;
  trackerId: string;
  keywords: { keyword: string }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (terms: string[]) =>
      updateLocalKeywords({ data: { projectId, trackerId, keywords: terms } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["localSeo", projectId],
      });
      onClose();
    },
  });
  const form = useAppForm({
    defaultValues: { keywords: keywords.map((row) => row.keyword).join("\n") },
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: z.object({ keywords: localKeywordsTextSchema }),
    },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(parseKeywordInput(value.keywords));
    },
  });
  return (
    <FormDialog
      title={t("local.manageKeywords")}
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" disabled={save.isPending} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="local-keywords" pending={save.isPending}>
            {t("ui.saveKeywords")}
          </Button>
        </>
      }
    >
      <form.AppForm>
        <form.Form id="local-keywords" className="space-y-4">
          <form.AppField name="keywords">
            {(field) => (
              <field.TextareaField
                label={t("local.keywordsToTrack")}
                placeholder={t("local.oneKeywordPerLine")}
                rows={6}
                description={t("local.manageKeywordsHelp")}
              />
            )}
          </form.AppField>
        </form.Form>
      </form.AppForm>
      {save.isError && (
        <QueryError
          error={save.error}
          fallback={t("local.couldNotSaveKeywords")}
        />
      )}
    </FormDialog>
  );
}
