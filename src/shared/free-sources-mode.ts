import { t } from "@/shared/i18n";
/** Pure helpers for the owned-site free-sources path. */

export function isFreeSourcesOnlyValue(
  value: string | null | undefined,
): boolean {
  const normalized = value?.trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  );
}

/**
 * Whether to show the DataForSEO setup modal/banner. FREE_SOURCES_ONLY
 * hides that nag: hasDataforseoAccess() is false by design in this mode,
 * but prompting the user to add a paid provider would be misleading.
 * Paid-only features still return their own FREE_SOURCES_ONLY limitation.
 */
export function shouldNagForDataforseoSetup(input: {
  freeSourcesOnly: boolean;
  configured: boolean | null;
}): boolean {
  if (input.freeSourcesOnly) return false;
  return input.configured === false;
}

/** Display labels for snapshot rows. Keep these user-facing and stable. */
export const FREE_SOURCE_LABELS = {
  gsc: "Google Search Console",
  pagespeed: "PageSpeed Insights",
  bing: "Bing Webmaster",
} as const;

export type FreeOwnedSiteSource = keyof typeof FREE_SOURCE_LABELS;

export const FREE_SOURCES_LIMITATIONS = t("freeSources.limitations");

export type OwnedSiteSnapshotStatus = "ok" | "skipped" | "error";

/** JSON values that server functions may return across the client boundary. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { readonly [key: string]: JsonValue };
export type SnapshotSummary = { readonly [key: string]: JsonValue };

export type FreeSourceSnapshotView = {
  source: FreeOwnedSiteSource;
  label: string;
  status: OwnedSiteSnapshotStatus;
  message: string | null;
  fetchedAt: string;
  summary: SnapshotSummary | null;
};

export type FreeSourcesStatus = {
  freeSourcesOnly: boolean;
  limitations: string;
  googleSearchConsole: {
    configured: boolean;
    connected: boolean;
    siteUrl: string | null;
  };
  pagespeed: {
    configured: boolean;
  };
  bing: {
    connected: boolean;
    siteUrl: string | null;
    canStoreKey: boolean;
  };
  snapshots: FreeSourceSnapshotView[];
};
