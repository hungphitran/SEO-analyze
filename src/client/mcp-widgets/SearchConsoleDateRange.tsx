import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { t } from "@/shared/i18n";

enum DateRange {
  Custom = "custom",
  Last7Days = "last_7_days",
  Last28Days = "last_28_days",
  Last3Months = "last_3_months",
  Last6Months = "last_6_months",
  Last12Months = "last_12_months",
  Last16Months = "last_16_months",
}

const LABELS: Record<DateRange, string> = {
  [DateRange.Custom]: t("ui.customRange"),
  [DateRange.Last7Days]: t("ui.last7Days"),
  [DateRange.Last28Days]: t("ui.last28Days"),
  [DateRange.Last3Months]: t("ui.last3Months"),
  [DateRange.Last6Months]: t("ui.last6Months"),
  [DateRange.Last12Months]: t("ui.last12Months"),
  [DateRange.Last16Months]: t("ui.last16Months"),
};

export function SearchConsoleDateRange({
  input,
  disabled,
  onChange,
}: {
  input: Record<string, unknown>;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      items={LABELS}
      value={
        input.startDate && input.endDate
          ? DateRange.Custom
          : typeof input.dateRange === "string"
            ? input.dateRange
            : DateRange.Last28Days
      }
      disabled={disabled}
      onValueChange={(value) => {
        if (value != null) onChange(value);
      }}
    >
      <SelectTrigger
        aria-label={t("ui.dateRange")}
        className="w-44 bg-card pr-3"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.values(DateRange).map((value) => (
          <SelectItem
            key={value}
            value={value}
            disabled={value === DateRange.Custom}
          >
            {LABELS[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
