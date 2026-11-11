import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/client/components/ui/combobox";
import {
  LOCATION_OPTIONS,
  getLocationOptionDisplayName,
} from "@/shared/keyword-locations";
import { t } from "@/shared/i18n";

type LocationOption = (typeof LOCATION_OPTIONS)[number];

// Matches the start of the name or of any word in it, so "uni" finds United
// States, not Tunisia, and "united states" still finds United States.
function matchesCountry(option: LocationOption, query: string) {
  const needle = query.trim().toLowerCase();
  const labels = [
    getLocationOptionDisplayName(option).toLowerCase(),
    option.label.toLowerCase(),
  ];
  return (
    labels.some(
      (label) =>
        label.startsWith(needle) ||
        label.split(/[\s-]+/).some((word) => word.startsWith(needle)),
    ) || option.shortLabel.toLowerCase().startsWith(needle)
  );
}

/** A searchable country picker. `value` is a DataForSEO location code. */
export function CountryCombobox({
  id,
  value,
  onChange,
  options = LOCATION_OPTIONS,
}: {
  id?: string;
  value: number;
  onChange: (locationCode: number) => void;
  /** Defaults to the full country list. */
  options?: readonly LocationOption[];
}) {
  const country = options.find((option) => option.code === value) ?? null;

  return (
    <Combobox
      items={options}
      value={country}
      itemToStringLabel={(option) => getLocationOptionDisplayName(option)}
      autoHighlight
      filter={matchesCountry}
      onValueChange={(option) => {
        if (option) onChange(option.code);
      }}
    >
      <ComboboxInput
        id={id}
        className="w-full"
        placeholder={t("ui.searchCountries")}
      />
      <ComboboxContent>
        <ComboboxEmpty>{t("ui.noCountriesMatch")}</ComboboxEmpty>
        <ComboboxList>
          {(option: LocationOption) => (
            <ComboboxItem key={option.code} value={option}>
              {getLocationOptionDisplayName(option)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
