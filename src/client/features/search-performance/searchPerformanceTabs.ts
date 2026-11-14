import { t } from "@/shared/i18n";
import {
  GSC_DEVICES,
  type SearchPerformanceDevice,
  type SearchPerformanceTab,
  type SearchPerformanceTableDimension,
} from "@/types/schemas/search-performance";

/** Tabs backed by a paginated `searchAnalytics.query` over one dimension. */
const TAB_DIMENSIONS: Partial<
  Record<SearchPerformanceTab, SearchPerformanceTableDimension>
> = {
  queries: "query",
  pages: "page",
  countries: "country",
  devices: "device",
  dates: "date",
  appearance: "searchAppearance",
};

export function tableDimensionForTab(
  tab: SearchPerformanceTab,
): SearchPerformanceTableDimension | null {
  return TAB_DIMENSIONS[tab] ?? null;
}

/** Tabs that read a different Search Console resource than search analytics. */
export function isPropertyTab(
  tab: SearchPerformanceTab,
): tab is "sitemaps" | "inspection" {
  return tab === "sitemaps" || tab === "inspection";
}

export function dimensionKeyLabel(
  dimension: SearchPerformanceTableDimension,
): string {
  switch (dimension) {
    case "query":
      return t("ui.query");
    case "page":
      return t("ui.page");
    case "country":
      return t("gscDetail.country");
    case "device":
      return t("gscDetail.device");
    case "date":
      return t("gscDetail.date");
    case "searchAppearance":
      return t("gscDetail.appearance");
  }
}

/** File-name part for exports, e.g. search-performance-countries-<range>. */
export function dimensionExportSlug(
  dimension: SearchPerformanceTableDimension,
): string {
  switch (dimension) {
    case "query":
      return "queries";
    case "page":
      return "pages";
    case "country":
      return "countries";
    case "device":
      return "devices";
    case "date":
      return "dates";
    case "searchAppearance":
      return "search-appearance";
  }
}

const DEVICE_LABELS: Record<SearchPerformanceDevice, string> = {
  DESKTOP: t("ui.desktop"),
  MOBILE: t("ui.mobile"),
  TABLET: t("ui.tablet"),
};

function isDevice(value: string): value is SearchPerformanceDevice {
  return GSC_DEVICES.some((device) => device === value);
}

/** "AMP_BLUE_LINK" -> "AMP blue link"; Google's enum values are not prose. */
function humanizeEnum(value: string): string {
  const words = value.toLowerCase().split("_").filter(Boolean);
  if (words.length === 0) return value;
  const text = words.join(" ");
  return text.replace(/\bamp\b/, "AMP").replace(/^./, (c) => c.toUpperCase());
}

/** Show a dimension key the way a person reads it. Queries and pages stay as is. */
export function formatDimensionKey(
  dimension: SearchPerformanceTableDimension,
  key: string,
): string {
  switch (dimension) {
    case "country":
      return key.toUpperCase();
    case "device": {
      const upper = key.toUpperCase();
      return isDevice(upper) ? DEVICE_LABELS[upper] : key;
    }
    case "searchAppearance":
      return humanizeEnum(key);
    default:
      return key;
  }
}
