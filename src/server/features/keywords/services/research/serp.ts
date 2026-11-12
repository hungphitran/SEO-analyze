import type { RankSourceProvider } from "@/shared/rank-tracking";
import { waitUntil } from "cloudflare:workers";
import {
  SERP_ANALYSIS_DEPTH,
  type SerpLiveItem,
} from "@/server/lib/dataforseo";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import type { SerpResultItem } from "@/types/keywords";
import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { normalizeKeyword } from "./helpers";
import { assertLocalResearchLocation } from "./local-volume";
import {
  OpenSerpError,
  resolveSerpProvider,
  type OpenSerpSnapshot,
} from "@/server/lib/openserp";
import { searchFreeSerp, toSerpAppError } from "@/server/lib/free-serp";
import { isFreeRankSource } from "@/shared/rank-tracking";
import { getIsoCountryCode } from "@/shared/keyword-locations";

const SERP_CACHE_TTL_SECONDS = 12 * 60 * 60;

type SerpAnalysisReason = "no_organic_results";

type SerpAnalysisResult = {
  requestedKeyword: string;
  items: SerpResultItem[];
  /** SERP depth this snapshot was crawled at — how deep the results go. */
  depth: number;
  sourceProvider: RankSourceProvider;
  fetchedAt: string;
  marketHint: string;
  reason?: SerpAnalysisReason;
};

const serpResultItemSchema = z.object({
  rank: z.number().int(),
  absolutePosition: z.number().int().nullable().optional(),
  title: z.string(),
  url: z.string(),
  domain: z.string(),
  description: z.string(),
  etv: z.number().nullable(),
  estimatedPaidTrafficCost: z.number().nullable(),
  referringDomains: z.number().nullable(),
  backlinks: z.number().nullable(),
  isNew: z.boolean(),
  rankChange: z.number().nullable(),
});

const serpCacheSchema = z.object({
  requestedKeyword: z.string(),
  items: z.array(serpResultItemSchema),
  // Entries written before depth was tracked don't say how deep they went, so
  // they're treated as the shallow floor: worst case a user re-buys a deeper
  // crawl once, rather than being shown 20 results as if they were 100.
  depth: z.number().int().default(SERP_ANALYSIS_DEPTH),
  sourceProvider: z
    .enum(["dataforseo", "openserp", "serpapi"])
    .default("dataforseo"),
  fetchedAt: z.string().optional(),
  marketHint: z.string().default(""),
  reason: z.enum(["no_organic_results"]).optional(),
});

function mapOrganicSerpItems(items: SerpLiveItem[]): SerpResultItem[] {
  return items
    .filter((item) => item.type === "organic")
    .map((item) => ({
      rank: item.rank_group ?? item.rank_absolute ?? 0,
      absolutePosition: item.rank_absolute ?? null,
      title: item.title ?? "",
      url: item.url ?? "",
      domain: item.domain ?? "",
      description: item.description ?? "",
      etv: item.etv ?? null,
      estimatedPaidTrafficCost: item.estimated_paid_traffic_cost ?? null,
      referringDomains: item.backlinks_info?.referring_domains ?? null,
      backlinks: item.backlinks_info?.backlinks ?? null,
      isNew: false,
      rankChange: null,
    }));
}

async function getSerpLiveAnalysis(
  input: {
    projectId: string;
    keyword: string;
    locationCode: number;
    languageCode: string;
    depth: number;
    locationName?: string;
  },
  billingCustomer: BillingCustomerContext,
): Promise<SerpAnalysisResult> {
  const keyword = normalizeKeyword(input.keyword);
  const { depth } = input;
  const sourceProvider = await resolveSerpProvider();
  if (input.locationName) {
    if (isFreeRankSource(sourceProvider)) {
      throw toSerpAppError(
        new OpenSerpError(
          "unsupported_targeting",
          "Free SERP providers support a market region hint, not city-level rank tracking.",
        ),
      );
    } else {
      await assertLocalResearchLocation(input.locationCode, input.locationName);
    }
  }

  const marketHint = getIsoCountryCode(input.locationCode);
  const cacheKey = await buildCacheKey("serp:analysis", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    sourceProvider,
    keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    locationName: input.locationName,
  });

  // Depth lives in the cached value, not the key: DataForSEO has no offset, so
  // a deeper crawl re-fetches the head too. A depth-100 snapshot therefore also
  // answers depth-20 requests, and a deeper request replaces the entry rather
  // than appending to it.
  const cachedRaw = await getCached(cacheKey);
  const cached = serpCacheSchema.safeParse(cachedRaw);
  if (cached.success && cached.data.depth >= depth) {
    return {
      ...cached.data,
      fetchedAt: cached.data.fetchedAt ?? new Date().toISOString(),
    };
  }

  let openSerpSnapshot: OpenSerpSnapshot | null = null;
  if (isFreeRankSource(sourceProvider)) {
    try {
      openSerpSnapshot = await searchFreeSerp(sourceProvider, {
        projectId: input.projectId,
        keyword,
        region: marketHint,
        lang: input.languageCode,
        limit: depth,
        locationName: input.locationName,
      });
    } catch (error) {
      throw toSerpAppError(error);
    }
  }
  const fetchedAt = openSerpSnapshot?.fetchedAt ?? new Date().toISOString();
  const items = openSerpSnapshot
    ? openSerpSnapshot.results.map((item) => ({
        rank: item.organicRank,
        absolutePosition: item.absolutePosition,
        title: item.title,
        url: item.url,
        domain: item.hostname,
        description: item.snippet,
        etv: null,
        estimatedPaidTrafficCost: null,
        referringDomains: null,
        backlinks: null,
        isNew: false,
        rankChange: null,
      }))
    : mapOrganicSerpItems(
        await createDataforseoClient(billingCustomer).serp.live({
          keyword,
          locationCode: input.locationCode,
          languageCode: input.languageCode,
          locationName: input.locationName,
          depth,
        }),
      );
  const result: SerpAnalysisResult = {
    requestedKeyword: keyword,
    items,
    // A free provider may return fewer rows than asked for (SerpApi: one page
    // per search); store the depth actually fetched so a later deeper request
    // is not answered as if it were complete.
    depth: openSerpSnapshot
      ? Math.min(depth, openSerpSnapshot.limitRequested)
      : depth,
    sourceProvider,
    fetchedAt,
    marketHint,
  };
  if (items.length === 0) {
    result.reason = "no_organic_results";
  }

  // DataForSEO reports "no results" transiently, and a deeper crawl overwrites
  // the same key. Without this guard one empty re-crawl would evict a good
  // snapshot and, being the deeper entry, answer every shallower request with
  // nothing for the rest of the TTL.
  if (items.length === 0 && cached.success && cached.data.items.length > 0) {
    return result;
  }

  // waitUntil, not void: workerd cancels unregistered pending I/O once the
  // response is sent, so a fire-and-forget put never persists the cache.
  waitUntil(
    setCached(
      cacheKey,
      result,
      isFreeRankSource(sourceProvider) ? 6 * 60 * 60 : SERP_CACHE_TTL_SECONDS,
    ).catch((error) => {
      console.error("keywords.serp.cache-write failed:", error);
    }),
  );

  return result;
}

export const getSerpAnalysis = getSerpLiveAnalysis;
