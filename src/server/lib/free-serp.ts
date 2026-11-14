import { AppError } from "@/server/lib/errors";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import {
  assertOpenSerpReady,
  getOpenSerpDailyRequestLimit,
  OpenSerpError,
  searchOpenSerp,
  type OpenSerpSnapshot,
  type SerpSourceProvider,
} from "@/server/lib/openserp";
import {
  getSerpApiDailyRequestLimit,
  searchSerpApi,
} from "@/server/lib/serpapi";

export type FreeSerpProvider = Exclude<SerpSourceProvider, "dataforseo">;

export function isFreeSerpProvider(
  provider: SerpSourceProvider | null | undefined,
): provider is FreeSerpProvider {
  return provider === "openserp" || provider === "serpapi";
}

export function freeSerpProviderLabel(provider: FreeSerpProvider): string {
  return provider === "serpapi" ? "SerpApi" : "OpenSERP";
}

/** Keywords one run may check: the provider's per-day (per-project) limit. */
export async function getFreeSerpDailyLimit(
  provider: FreeSerpProvider,
): Promise<number> {
  return provider === "serpapi"
    ? getSerpApiDailyRequestLimit()
    : getOpenSerpDailyRequestLimit();
}

/**
 * Validate, reserve quota and fetch one keyword's SERP from the selected free
 * provider. Throws OpenSerpError (SerpApiError is a subclass) on any failure,
 * so callers record an error state and never a rank.
 */
export async function searchFreeSerp(
  provider: FreeSerpProvider,
  input: {
    projectId: string;
    keyword: string;
    region: string;
    lang: string;
    limit: number;
    locationName?: string | null;
  },
): Promise<OpenSerpSnapshot> {
  if (provider === "serpapi") return searchSerpApi(input);
  await assertOpenSerpReady({ locationName: input.locationName });
  const reserved = await RankTrackingRepository.reserveOpenSerpRequest(
    input.projectId,
    await getOpenSerpDailyRequestLimit(),
  );
  if (!reserved) {
    throw new OpenSerpError(
      "quota_exceeded",
      "OpenSERP daily project request limit reached; no rank was recorded.",
    );
  }
  return searchOpenSerp({
    keyword: input.keyword,
    region: input.region,
    lang: input.lang,
    limit: input.limit,
    locationName: input.locationName,
  });
}

/**
 * Normalize a tracked domain for matching against result hostnames: accepts
 * "Example.com", "www.example.com", "https://www.example.com/path?x=1",
 * "example.com:8080", IDNs (compared in punycode, like result hostnames), and
 * a trailing dot. Returns null for input that is not a hostname, so a bad
 * value is reported instead of silently matching nothing or everything.
 */
export function normalizeRankTargetDomain(domain: string): string | null {
  const trimmed = domain.trim();
  if (!trimmed) return null;
  let host: string;
  try {
    host = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    ).hostname;
  } catch {
    return null;
  }
  host = host
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.$/, "");
  return host.includes(".") ? host : null;
}

/** Does a result hostname belong to the tracked domain (itself or a subdomain)? */
export function hostnameMatchesTarget(hostname: string, target: string) {
  return hostname === target || hostname.endsWith(`.${target}`);
}

/**
 * Turn a free-provider failure into an AppError so the browser receives a
 * stable code with Vietnamese copy instead of "unexpected error". Non-provider
 * errors pass through unchanged. The message is the provider error's own
 * (key-free) text, for server logs only; clients get just the code.
 */
export function toSerpAppError(error: unknown): unknown {
  if (!(error instanceof OpenSerpError)) return error;
  switch (error.code) {
    case "configuration_error":
      return new AppError("SERP_NOT_CONFIGURED", error.message);
    case "quota_exceeded":
    case "rate_limited":
      return new AppError("SERP_QUOTA_EXCEEDED", error.message);
    case "invalid_input":
    case "unsupported_targeting":
      return new AppError("VALIDATION_ERROR", error.message);
    default:
      return new AppError("SERP_UNAVAILABLE", error.message);
  }
}
