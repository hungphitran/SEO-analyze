import type { EnvRecord, PreflightItem } from "@/lib/selfhost-preflight";

function get(env: EnvRecord, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

/**
 * Optional free signals (CrUX real-user vitals, Open PageRank). Never failing:
 * without a key the matching panel is simply hidden.
 */
export function checkOptionalFreeSignals(
  env: EnvRecord,
  items: PreflightItem[],
): void {
  items.push(
    get(env, "CRUX_API_KEY")
      ? {
          key: "crux",
          name: "Chrome UX Report",
          level: "ok",
          message: "CRUX_API_KEY is set",
        }
      : get(env, "PAGESPEED_API_KEY")
        ? {
            key: "crux",
            name: "Chrome UX Report",
            level: "info",
            message:
              "CRUX_API_KEY not set; PAGESPEED_API_KEY will be tried (the Chrome UX Report API must be enabled for that key).",
          }
        : {
            key: "crux",
            name: "Chrome UX Report",
            level: "info",
            message:
              "Not configured (optional). Real-user Core Web Vitals stay hidden. See docs/SELF_HOSTING_FREE_SOURCES.md.",
          },
    get(env, "OPEN_PAGERANK_API_KEY")
      ? {
          key: "open-pagerank",
          name: "Open PageRank",
          level: "ok",
          message: "OPEN_PAGERANK_API_KEY is set",
        }
      : {
          key: "open-pagerank",
          name: "Open PageRank",
          level: "info",
          message:
            "Not configured (optional). The domain authority score stays hidden. See docs/SELF_HOSTING_FREE_SOURCES.md.",
        },
  );
}
