import { sortBy } from "remeda";
import type { MonthlySearch } from "@/types/keywords";
import { t } from "@/shared/i18n";

export { LOCATIONS } from "./locations";

export const MONTH_SHORT_LABELS = [
  t("ui.jan"),
  t("ui.feb"),
  t("ui.mar"),
  t("ui.apr"),
  t("ui.may"),
  t("ui.jun"),
  t("ui.jul"),
  t("ui.aug"),
  t("ui.sep"),
  t("ui.oct"),
  t("ui.nov"),
  t("ui.dec"),
] as const;

/** The most recent 12 months of a trend, oldest first. */
export function lastTwelveMonths(trend: MonthlySearch[]): MonthlySearch[] {
  return sortBy(trend, (item) => item.year * 100 + item.month).slice(-12);
}

export function parseTerms(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[,+]/)
    .map((term) => term.trim())
    .filter(Boolean);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Intl.NumberFormat().format(value);
}

export function formatCompactNumber(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
