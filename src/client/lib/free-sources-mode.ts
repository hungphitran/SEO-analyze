import { useQuery } from "@tanstack/react-query";
import { getSeoApiKeyStatus } from "@/serverFunctions/config";

/**
 * Shared status query (same key as AppShell's, so one request serves both).
 * `freeSourcesOnly` is true when FREE_SOURCES_ONLY is on and DataForSEO-only
 * features are hidden (see src/shared/free-sources-visibility.ts).
 */
export function useFreeSourcesStatus(enabled = true) {
  const query = useQuery({
    queryKey: ["seoApiKeyStatus"],
    queryFn: () => getSeoApiKeyStatus(),
    enabled,
  });
  return {
    /** Still loading the first answer. */
    pending: enabled && query.isPending,
    /** True only when the server confirmed FREE_SOURCES_ONLY. */
    freeSourcesOnly: query.data?.freeSourcesOnly === true,
  };
}

/** Convenience: confirmed free-sources-only mode (false while loading/failed). */
export function useFreeSourcesOnly(enabled = true): boolean {
  return useFreeSourcesStatus(enabled).freeSourcesOnly;
}
