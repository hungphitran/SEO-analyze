import type { BacklinksTab } from "@/types/schemas/backlinks";
import type { BacklinksOverviewData } from "./backlinksPageTypes";
import { t } from "@/shared/i18n";

export const TAB_DESCRIPTIONS: Record<BacklinksTab, string> = {
  backlinks:
    t("backlinks.tabLinksHelp"),
  domains:
    t("backlinks.tabDomainsHelp"),
  pages:
    t("backlinks.tabPagesHelp"),
};

export function buildSummaryStats(data: BacklinksOverviewData | undefined) {
  if (!data) return [];

  return [
    {
      label: t("backlinks.title"),
      value: formatNumber(data.summary.backlinks),
      description: t("backlinks.helpTotalLinks"),
    },
    {
      label: t("backlinks.referringDomains"),
      value: formatNumber(data.summary.referringDomains),
      description: t("backlinks.helpUniqueDomainsHere"),
    },
    {
      label: t("backlinks.referringPages"),
      value: formatNumber(data.summary.referringPages),
      description: t("backlinks.helpUniquePagesHere"),
    },
    {
      label: t("metrics.rank"),
      value: formatNumber(data.summary.rank),
      description: t("backlinks.helpDfsAuthority"),
    },
    {
      label: t("backlinks.backlinkSpamScore"),
      value: formatDecimal(data.summary.backlinksSpamScore),
      description: t("backlinks.helpSpamHere"),
    },
    {
      label: t("backlinks.brokenBacklinks"),
      value: formatNumber(data.summary.brokenBacklinks),
      description: t("backlinks.helpLinksToBroken"),
    },
    {
      label: t("backlinks.brokenPages"),
      value: formatNumber(data.summary.brokenPages),
      description: t("backlinks.helpBrokenStillLinked"),
    },
    {
      label: t("backlinks.targetSpamScore"),
      value: formatDecimal(data.summary.targetSpamScore),
      description: t("backlinks.helpTargetSpam"),
    },
  ];
}

export function formatNumber(value: number | null | undefined) {
  if (value == null) return "-";
  return new Intl.NumberFormat().format(Math.round(value));
}

export function formatDecimal(value: number | null | undefined) {
  if (value == null) return "-";
  return value.toFixed(value >= 100 ? 0 : 1);
}

export function formatTooltipValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "string") return value;
  return "-";
}

export function formatCompactDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatMonthLabel(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    year: "2-digit",
  });
}

export function formatRelativeTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "recently";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function extractUrlPath(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return url;
  }
}

const ELLIPSIS = "...";

export function truncateMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  if (maxLength <= ELLIPSIS.length)
    return value.slice(0, Math.max(maxLength, 0));
  const sideLength = Math.floor((maxLength - ELLIPSIS.length) / 2);
  if (sideLength <= 0) {
    return `${value.slice(0, maxLength - ELLIPSIS.length)}${ELLIPSIS}`;
  }
  return `${value.slice(0, sideLength)}${ELLIPSIS}${value.slice(-sideLength)}`;
}
