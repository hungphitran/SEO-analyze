import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { isFreeSourcesOnlyValue } from "@/shared/free-sources-mode";

export async function isFreeSourcesOnly(): Promise<boolean> {
  return isFreeSourcesOnlyValue(await getOptionalEnvValue("FREE_SOURCES_ONLY"));
}

export type LighthouseProvider = "dataforseo" | "pagespeed";

/**
 * Free-sources mode always uses PageSpeed Insights for Lighthouse. Otherwise
 * LIGHTHOUSE_PROVIDER=pagespeed opts in, and DataForSEO remains the default
 * so existing tests and paid deployments stay unchanged.
 */
export async function resolveLighthouseProvider(): Promise<LighthouseProvider> {
  if (await isFreeSourcesOnly()) return "pagespeed";
  const raw = (await getOptionalEnvValue("LIGHTHOUSE_PROVIDER"))
    ?.trim()
    .toLowerCase();
  return raw === "pagespeed" ? "pagespeed" : "dataforseo";
}
