import { formatUiRelativeTime } from "@/shared/i18n";

/** Relative time for an ISO timestamp, in the default UI locale. */
export function formatRelativeTime(iso: string): string {
  return formatUiRelativeTime(iso);
}
