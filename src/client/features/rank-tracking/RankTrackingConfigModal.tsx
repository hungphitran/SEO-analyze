import { useId, useState } from "react";
import { projectsQueryOptions } from "@/client/features/projects/projectQueries";
import { useQuery } from "@tanstack/react-query";
import { revalidateLogic, useStore } from "@tanstack/react-form";
import { Info } from "lucide-react";
import { useAppForm } from "@/client/components/form/useAppForm";
import { CountryCombobox } from "@/client/components/CountryCombobox";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Field, FieldLabel } from "@/client/components/ui/field";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";
import { domainField, normalizeDomain } from "@/types/schemas/domain";
import { pagesToDepth, estimateRankCheckCredits } from "@/shared/rank-tracking";
import { getLanguageCode } from "@/client/features/keywords/locations";
import {
  SERP_LANGUAGE_OPTIONS,
  getLanguageDisplayName,
  getIsoCountryCode,
} from "@/shared/keyword-locations";
import type { ProjectMarket } from "@/client/features/projects/types";
import { QueryError } from "@/client/components/QueryState";
import { Spinner } from "@/client/components/Spinner";
import { getFieldError } from "@/client/lib/forms";
import { SearchTargetingField } from "./SearchTargetingField";
import { KeywordSuggestionStep } from "./KeywordSuggestionStep";
import {
  useSaveConfigMutations,
  type SaveConfigInput,
} from "./useSaveConfigMutations";
import { ScheduleField } from "./ScheduleField";
import {
  localScheduleTimeFrom,
  randomScheduleDate,
  withBrowserTimeZone,
  type LocalScheduleTime,
} from "./scheduleTime";
import { t } from "@/shared/i18n";

type Props = {
  projectId: string;
  existingConfig?: RankTrackingConfig | null;
  onClose: () => void;
  onSaved: (createdConfigId?: string) => void;
  onConfigCreated?: () => void;
};

type ConfigFormValues = Omit<SaveConfigInput, "scheduleTime"> & {
  scheduleTime: LocalScheduleTime;
};

const LANGUAGE_ITEMS = SERP_LANGUAGE_OPTIONS.map((language) => ({
  value: language.code,
  label: getLanguageDisplayName(language.code, language.label),
}));

const DEVICE_ITEMS: { value: SaveConfigInput["devices"]; label: string }[] = [
  { value: "both", label: t("rank.desktopAndMobile") },
  { value: "desktop", label: t("rank.desktopOnly") },
  { value: "mobile", label: t("rank.mobileOnly") },
];

const DEPTH_ITEMS = Array.from({ length: 10 }, (_, i) => i + 1).map(
  (pages) => ({
    value: pagesToDepth(pages),
    label: t("ui.serpDepthPages", { n: pages, top: pages * 10 }),
  }),
);

function validateConfig(values: ConfigFormValues) {
  const fields: Partial<Record<keyof ConfigFormValues, string>> = {};
  if (!values.domain.trim()) {
    fields.domain = t("rank.enterADomain");
  } else if (!domainField.safeParse(values.domain).success) {
    fields.domain = t("rank.enterValidDomain");
  }
  if (values.targetingMode === "local" && !values.locationName) {
    fields.locationName = t("rank.selectCity");
  }
  return Object.keys(fields).length > 0 ? { fields } : undefined;
}

export function RankTrackingConfigModal({
  projectId,
  existingConfig,
  onClose,
  onSaved,
  onConfigCreated,
}: Props) {
  // A new domain starts from the project's market, so it waits for projects.
  const projectsQuery = useQuery({
    ...projectsQueryOptions(),
    enabled: !existingConfig,
  });
  const initialMarket =
    existingConfig ??
    projectsQuery.data?.find((project) => project.id === projectId);

  if (!initialMarket) {
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="sr-only">{t("rank.addDomain")}</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-40 items-center justify-center">
            {projectsQuery.isPending ? (
              <Spinner />
            ) : (
              <QueryError
                error={projectsQuery.error}
                fallback={t("settings.failedLoadProject")}
                onRetry={() => void projectsQuery.refetch()}
                isRetrying={projectsQuery.isFetching}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <RankTrackingConfigModalContent
      projectId={projectId}
      existingConfig={existingConfig}
      initialMarket={initialMarket}
      onClose={onClose}
      onSaved={onSaved}
      onConfigCreated={onConfigCreated}
    />
  );
}

function RankTrackingConfigModalContent({
  projectId,
  existingConfig,
  initialMarket,
  onClose,
  onSaved,
  onConfigCreated,
}: Props & { initialMarket: ProjectMarket }) {
  const countryId = useId();
  const isEdit = !!existingConfig;
  const [createdConfigId, setCreatedConfigId] = useState<string>();
  // An untouched edit leaves the stored run time alone; anything that changes
  // the schedule sends the time on screen so it is the one that gets saved.
  const [scheduleTimeEdited, setScheduleTimeEdited] = useState(false);

  const { createMutation, updateMutation } = useSaveConfigMutations({
    projectId,
    existingConfig,
    onCreated: (configId) => {
      setCreatedConfigId(configId);
      onConfigCreated?.();
    },
    onUpdated: () => onSaved(),
  });

  // Built once: the schedule default is random, and new default values would
  // reset the form on every render.
  const [defaultValues] = useState<ConfigFormValues>(() => ({
    domain: existingConfig?.domain ?? "",
    locationCode: existingConfig?.locationCode ?? initialMarket.locationCode,
    languageCode: existingConfig?.languageCode ?? initialMarket.languageCode,
    targetingMode: existingConfig?.locationName ? "local" : "national",
    locationName: existingConfig?.locationName ?? undefined,
    devices: existingConfig?.devices ?? "mobile",
    schedule: existingConfig?.scheduleInterval ?? "weekly",
    // Shown and edited in the browser's timezone; the server converts it to UTC.
    scheduleTime: localScheduleTimeFrom(
      existingConfig?.nextCheckAt
        ? new Date(existingConfig.nextCheckAt)
        : randomScheduleDate(),
    ),
    serpDepth: existingConfig?.serpDepth ?? 40,
  }));

  const form = useAppForm({
    defaultValues,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: ({ value }) => validateConfig(value) },
    onSubmit: async ({ value, formApi }) => {
      const domain = domainField.parse(value.domain);
      formApi.setFieldValue("domain", domain);
      const sendScheduleTime =
        value.schedule !== "manual" &&
        (!existingConfig ||
          scheduleTimeEdited ||
          value.schedule !== existingConfig.scheduleInterval);
      const input: SaveConfigInput = {
        ...value,
        domain,
        scheduleTime: sendScheduleTime
          ? withBrowserTimeZone(value.scheduleTime)
          : undefined,
      };
      await (isEdit
        ? updateMutation.mutateAsync(input)
        : createMutation.mutateAsync(input));
    },
  });
  const values = useStore(form.store, (state) => state.values);
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

  const closeKeywordStep = () => onSaved(createdConfigId);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (open || isSubmitting) return;
        if (createdConfigId) closeKeywordStep();
        else onClose();
      }}
    >
      <DialogContent
        showCloseButton={!!createdConfigId}
        className={createdConfigId ? "sm:max-w-3xl" : "sm:max-w-lg"}
      >
        {createdConfigId ? (
          <KeywordSuggestionStep
            configId={createdConfigId}
            projectId={projectId}
            domain={values.domain}
            locationCode={values.locationCode}
            onDone={onSaved}
            onClose={closeKeywordStep}
          />
        ) : (
          <form.AppForm>
            <form.Form className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>
                  {isEdit ? t("rank.editConfig") : t("rank.addDomain")}
                </DialogTitle>
              </DialogHeader>

              <form.AppField
                name="domain"
                listeners={{
                  onBlur: ({ value }) => {
                    try {
                      form.setFieldValue("domain", normalizeDomain(value), {
                        dontValidate: true,
                      });
                    } catch {
                      // Keep invalid partial input editable; submit shows the error.
                    }
                  },
                }}
              >
                {(field) => (
                  <field.TextField
                    label={t("rank.targetDomain")}
                    placeholder="example.com"
                  />
                )}
              </form.AppField>

              <Field>
                <FieldLabel htmlFor={countryId}>{t("common.country")}</FieldLabel>
                <CountryCombobox
                  id={countryId}
                  value={values.locationCode}
                  onChange={(locationCode) => {
                    form.setFieldValue("locationCode", locationCode);
                    form.setFieldValue(
                      "languageCode",
                      getLanguageCode(locationCode),
                    );
                    // A picked city belongs to the previous country.
                    form.setFieldValue("locationName", undefined);
                  }}
                />
              </Field>

              <form.Field name="locationName">
                {(field) => (
                  <SearchTargetingField
                    mode={values.targetingMode}
                    onModeChange={(mode) =>
                      form.setFieldValue("targetingMode", mode)
                    }
                    locationName={field.state.value}
                    onLocationNameChange={field.handleChange}
                    countryCode={getIsoCountryCode(values.locationCode)}
                    error={getFieldError(field.state.meta.errors) ?? undefined}
                  />
                )}
              </form.Field>

              <form.AppField name="languageCode">
                {(field) => (
                  <field.SelectField
                    label={t("common.language")}
                    items={LANGUAGE_ITEMS}
                    description={t("rank.languageHelp")}
                  />
                )}
              </form.AppField>

              <div className="flex flex-col gap-1.5">
                <form.AppField name="devices">
                  {(field) => (
                    <field.SelectField
                      label={t("rank.devices")}
                      items={DEVICE_ITEMS}
                      description={t("rank.deviceHelp")}
                    />
                  )}
                </form.AppField>
                {values.devices === "both" && (
                  <p className="flex items-start gap-1.5 text-xs text-info">
                    <Info className="mt-0.5 size-3.5 shrink-0" />
                    {t("ui.trackingBothDevicesUses2xCredits")}
                  </p>
                )}
              </div>

              <ScheduleField
                schedule={values.schedule}
                onScheduleChange={(schedule) =>
                  form.setFieldValue("schedule", schedule)
                }
                scheduleTime={values.scheduleTime}
                onScheduleTimeChange={(time) => {
                  form.setFieldValue("scheduleTime", time);
                  setScheduleTimeEdited(true);
                }}
              />

              <form.AppField name="serpDepth">
                {(field) => (
                  <field.SelectField
                    label={t("rank.searchDepth")}
                    items={DEPTH_ITEMS}
                    description={t("rank.depthCost")}
                  />
                )}
              </form.AppField>

              <CostEstimate
                devices={values.devices}
                serpDepth={values.serpDepth}
                schedule={values.schedule}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onClose}
                  disabled={isSubmitting}
                >
                  {t("common.cancel")}
                </Button>
                <form.SubmitButton>
                  {isEdit ? t("common.saveChangesTitle") : t("rank.addDomain")}
                </form.SubmitButton>
              </DialogFooter>
            </form.Form>
          </form.AppForm>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CostEstimate({
  devices,
  serpDepth,
  schedule,
}: Pick<ConfigFormValues, "devices" | "serpDepth" | "schedule">) {
  // Scheduled checks run through the cheaper task queue; manual configs only
  // ever pay the live price.
  const { costUsd: costPerKeyword } = estimateRankCheckCredits(
    ["plain keyword"],
    devices,
    serpDepth,
    schedule === "manual" ? "live" : "queued",
  );
  const checksPerMonth =
    schedule === "daily" ? 30 : schedule === "weekly" ? 4 : 1;
  return (
    <div className="space-y-0.5 rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground">
      <div>
        <span className="font-mono font-semibold text-foreground">
          up to ${costPerKeyword.toFixed(4)}
        </span>{" "}
        {t("ui.perKeywordPerCheck")}
      </div>
      {schedule !== "manual" && (
        <div>
          {t("ui.50KeywordsWouldCostUpTo")}{" "}
          <span className="font-mono font-semibold text-foreground">
            ${(costPerKeyword * 50 * checksPerMonth).toFixed(2)}
          </span>
          {t("ui.month")}
        </div>
      )}
    </div>
  );
}
