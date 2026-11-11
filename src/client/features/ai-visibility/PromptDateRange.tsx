import { CalendarDays } from "lucide-react";
import { Input } from "@/client/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { t } from "@/shared/i18n";

export enum PromptRange {
  Last7 = "last_7_days",
  Last28 = "last_28_days",
  Last90 = "last_90_days",
  All = "all",
  Custom = "custom",
}

interface PromptPeriod {
  preset: PromptRange;
  start: string;
  end: string;
}

const options = [
  { value: PromptRange.Last7, label: t("ai.last7") },
  { value: PromptRange.Last28, label: t("ai.last28") },
  { value: PromptRange.Last90, label: t("ai.last90") },
  { value: PromptRange.All, label: t("ai.allHistory") },
  { value: PromptRange.Custom, label: t("ai.customRange") },
];

function localDate(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

export function promptPeriod(preset = PromptRange.Last28): PromptPeriod {
  const end = new Date();
  const start = new Date(end);
  const days =
    preset === PromptRange.Last7 ? 7 : preset === PromptRange.Last90 ? 90 : 28;
  start.setDate(start.getDate() - days + 1);
  return { preset, start: localDate(start), end: localDate(end) };
}

export function inPromptPeriod(createdAt: string, period: PromptPeriod) {
  if (period.preset === PromptRange.All) return true;
  if (!period.start || !period.end || period.start > period.end) return false;
  const end = new Date(`${period.end}T00:00:00`);
  end.setDate(end.getDate() + 1);
  const time = new Date(createdAt).getTime();
  return (
    time >= new Date(`${period.start}T00:00:00`).getTime() &&
    time < end.getTime()
  );
}

export function PromptDateRange({
  value,
  onChange,
}: {
  value: PromptPeriod;
  onChange: (period: PromptPeriod) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        items={options}
        value={value.preset}
        onValueChange={(next) => {
          const option = options.find((item) => item.value === next);
          if (option)
            onChange(
              option.value === PromptRange.Custom
                ? { ...value, preset: option.value }
                : promptPeriod(option.value),
            );
        }}
      >
        <SelectTrigger size="sm" aria-label={t("ai.analysisDateRange")}>
          <CalendarDays className="size-3.5" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value.preset === PromptRange.Custom && (
        <>
          <Input
            type="date"
            aria-label={t("ai.periodStart")}
            className="h-7 w-36 text-xs"
            value={value.start}
            max={value.end || undefined}
            onChange={(event) =>
              onChange({ ...value, start: event.target.value })
            }
          />
          <span className="text-xs text-muted-foreground">{t("ui.to")}</span>
          <Input
            type="date"
            aria-label={t("ai.periodEnd")}
            className="h-7 w-36 text-xs"
            value={value.end}
            min={value.start || undefined}
            onChange={(event) =>
              onChange({ ...value, end: event.target.value })
            }
          />
          {(!value.start || !value.end || value.start > value.end) && (
            <p role="alert" className="w-full text-xs text-destructive">
              {t("ui.chooseAStartDateOnOr")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
