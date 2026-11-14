import { useId, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { FormDialog } from "@/client/components/FormDialog";
import { Button } from "@/client/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/client/components/ui/field";
import { Switch } from "@/client/components/ui/switch";
import {
  RESULT_LIMITS,
  type KeywordMode,
} from "@/client/features/keywords/keywordResearchTypes";
import { isLabsLocationCode } from "@/client/features/keywords/locations";
import type { KeywordResearchControllerState } from "./types";
import { t } from "@/shared/i18n";

type Props = {
  controller: KeywordResearchControllerState;
};

const RESULT_ITEMS = RESULT_LIMITS.map((limit) => ({
  value: limit,
  label: t("ui.results", { v0: limit }),
}));

const MODE_ITEMS: { value: KeywordMode; label: string }[] = [
  { value: "auto", label: t("kw.sourceAuto") },
  { value: "suggestions", label: t("kw.phraseMatch") },
  { value: "ideas", label: t("kw.categoryIdeas") },
  { value: "related", label: t("kw.peopleAlsoSearch") },
];

const GOOGLE_ADS_ONLY_NOTE = t("kw.notAvailGoogleAdsCountries");

/** The search settings most people leave at their defaults. */
export function KeywordSearchOptions({ controller }: Props) {
  const {
    controlsForm,
    preferredGroupKeywords: groupKeywords,
    setPreferredGroupKeywords: setGroupKeywords,
  } = controller;
  const [open, setOpen] = useState(false);

  return (
    <controlsForm.Subscribe selector={(state) => state.values}>
      {(values) => {
        // Google-Ads-only countries ignore source, clickstream, and grouping.
        const labs = isLabsLocationCode(values.locationCode);
        const local = Boolean(values.locationName);

        return (
          <>
            <Button
              variant="outline"
              className="w-full font-normal lg:w-auto lg:shrink-0"
              aria-haspopup="dialog"
              onClick={() => setOpen(true)}
            >
              <SlidersHorizontal data-icon="inline-start" />
              {t("ui.options")}
            </Button>

            {open ? (
              <FormDialog
                title={t("kw.searchOptions")}
                onClose={() => setOpen(false)}
                actions={
                  <Button onClick={() => setOpen(false)}>
                    {t("common.done")}
                  </Button>
                }
              >
                <controlsForm.AppField name="resultLimit">
                  {(field) => (
                    <field.SelectField
                      label={t("common.results")}
                      items={RESULT_ITEMS}
                    />
                  )}
                </controlsForm.AppField>

                <controlsForm.AppField name="mode">
                  {(field) => (
                    <field.SelectField
                      label={t("kw.keywordSource")}
                      description={labs ? undefined : GOOGLE_ADS_ONLY_NOTE}
                      items={MODE_ITEMS}
                      disabled={!labs}
                    />
                  )}
                </controlsForm.AppField>

                <controlsForm.Field name="clickstream">
                  {(field) => (
                    <ToggleRow
                      label={t("kw.clickstreamVolumes")}
                      help={
                        !labs
                          ? GOOGLE_ADS_ONLY_NOTE
                          : local
                            ? t("kw.clickstreamCountryOnly")
                            : t("kw.groupKeywordsHelp")
                      }
                      // The saved choice returns when the option applies again.
                      checked={labs && !local && field.state.value}
                      disabled={!labs || local}
                      onChange={(checked) => field.handleChange(checked)}
                    />
                  )}
                </controlsForm.Field>

                <ToggleRow
                  label={t("kw.groupKeywords")}
                  help={labs ? undefined : GOOGLE_ADS_ONLY_NOTE}
                  checked={labs && groupKeywords}
                  disabled={!labs}
                  onChange={setGroupKeywords}
                />
              </FormDialog>
            ) : null}
          </>
        );
      }}
    </controlsForm.Subscribe>
  );
}

function ToggleRow({
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  help?: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();

  return (
    <Field orientation="horizontal" data-disabled={disabled}>
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {help ? (
          <FieldDescription id={`${id}-description`}>{help}</FieldDescription>
        ) : null}
      </FieldContent>
      <Switch
        id={id}
        aria-describedby={help ? `${id}-description` : undefined}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </Field>
  );
}
