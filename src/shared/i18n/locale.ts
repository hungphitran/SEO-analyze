/** Default UI locale for the OpenSEO self-host app. Display only. */
export const UI_LOCALE = "vi-VN" as const;
export const UI_LANG = "vi" as const;

export function formatUiNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(UI_LOCALE, options).format(value);
}

export function formatUiPercent(
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(UI_LOCALE, {
    style: "percent",
    maximumFractionDigits: 1,
    ...options,
  }).format(value);
}

/** Date-only display. Does not change the instant or timezone used. */
export function formatUiDate(
  value: Date | string | number,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(UI_LOCALE, options);
}

/** Date and time display. Timezone defaults to the environment's local zone. */
export function formatUiDateTime(
  value: Date | string | number,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(UI_LOCALE, options);
}

export function formatUiRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = then - Date.now();
  const absolute = Math.abs(diff);
  const formatter = new Intl.RelativeTimeFormat(UI_LOCALE, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 365 * 24 * 60 * 60 * 1000],
    ["month", 30 * 24 * 60 * 60 * 1000],
    ["day", 24 * 60 * 60 * 1000],
    ["hour", 60 * 60 * 1000],
    ["minute", 60 * 1000],
  ];
  for (const [unit, ms] of units) {
    if (absolute >= ms) return formatter.format(Math.round(diff / ms), unit);
  }
  return "vừa xong";
}
