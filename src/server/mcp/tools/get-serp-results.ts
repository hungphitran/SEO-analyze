import { waitUntil } from "cloudflare:workers";
import { z } from "zod";
import {
  createDataforseoClient,
  SERP_ANALYSIS_DEPTH,
} from "@/server/lib/dataforseo";
import { resolveSerpProvider } from "@/server/lib/openserp";
import { searchFreeSerp } from "@/server/lib/free-serp";
import { isFreeRankSource } from "@/shared/rank-tracking";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import { serpSchema, serpItemSchema } from "@/shared/mcp-contracts";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { resolveMarket } from "@/shared/keyword-locations";
import { getIsoCountryCode } from "@/shared/keyword-locations";
import { assertLocalResearchLocation } from "@/server/features/keywords/services/research/local-volume";
import { toolErrorMessage } from "@/server/mcp/tool-error-message";
import {
  formatMcpTable,
  sectionTableBudget,
  truncatedCell,
  type McpTableColumn,
} from "@/server/mcp/table";
import {
  languageCodeSchema,
  locationCodeSchema,
  projectIdSchema,
} from "@/server/mcp/schemas";

// A repeat within this window is answered from the saved rows, uncharged, so a
// caller that lost a response can call again instead of paying twice.
const SERP_RESULTS_CACHE_TTL_SECONDS = 12 * 60 * 60;
const OPEN_SERP_RESULTS_CACHE_TTL_SECONDS = 6 * 60 * 60;
const serpResultsCacheSchema = z.union([
  z.array(serpItemSchema),
  z.object({
    items: z.array(serpItemSchema),
    fetchedAt: z.string(),
  }),
]);

type SerpItem = z.infer<typeof serpItemSchema>;

// `type` is load-bearing: the advanced SERP is a mixed list, so without it a
// featured_snippet or people_also_ask row (which has no domain/title/url) reads
// as an unlabeled organic position. Snippets are trimmed so the prose column
// can't dominate the table — the full text stays in structuredContent.
const SERP_ITEM_COLUMNS: McpTableColumn<SerpItem>[] = [
  { header: "rank", value: (item) => item.rank },
  { header: "type", value: (item) => item.type },
  { header: "organic rank", value: (item) => item.organicRank },
  { header: "domain", value: (item) => item.domain },
  { header: "title", value: (item) => item.title },
  { header: "url", value: (item) => item.url },
  {
    header: "description",
    value: (item) => item.description,
    format: truncatedCell(120),
  },
];

const querySchema = z.object({
  keyword: z.string().min(1).describe("Search query to fetch the SERP for."),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
  locationName: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional city, county, or region inside the query's country, for a local SERP. Call search_serp_locations first and pass its locationName verbatim. Same price as a national SERP.",
    ),
  device: z
    .enum(["desktop", "mobile"])
    .optional()
    .describe(
      "Device to fetch when using DataForSEO (default desktop). OpenSERP does not provide device-specific results; an explicit mobile request is rejected.",
    ),
});

const inputSchema = {
  projectId: projectIdSchema,
  queries: z
    .array(querySchema)
    .min(1)
    .max(10)
    .describe(
      "1-10 queries. Bulk-friendly — prefer this over multiple single-query calls.",
    ),
  depth: z
    .number()
    .int()
    .min(10)
    .max(100)
    .multipleOf(10)
    .optional()
    .describe(
      "How many SERP rows to crawl per keyword — a multiple of 10 from 10 to 100, default 20. Google has no offset, so a deeper crawl re-fetches the top too: each additional 10 adds ~2.5 credits per keyword. Only raise it when you need ranks past the top 20.",
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const getSerpResultsTool = {
  name: "get_serp_results",
  config: {
    title: "Get Google SERP results",
    description:
      "Fetch live Google organic search results for 1-10 keywords. Use this to inspect who ranks for a query, verify competitors, compare SERPs across keywords, or gather source URLs before content planning. Returns up to `depth` organic results per keyword (default 20), with organic rank separate from absolute SERP position. The selected SERP provider and freshness are returned. DataForSEO calls use credits; OpenSERP calls do not use DataForSEO and do not provide device-specific results. Cached queries are returned without another provider request. Per-keyword errors don't fail the batch.",
    inputSchema,
    outputSchema: serpSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const sourceProvider = await resolveSerpProvider();
    const client =
      sourceProvider === "dataforseo"
        ? createDataforseoClient(context.billing)
        : undefined;
    const depth = args.depth ?? SERP_ANALYSIS_DEPTH;
    const results = await Promise.all(
      args.queries.map(async (q) => {
        try {
          const market = resolveMarket(q, context.project);
          const scope = {
            ...market,
            locationName: q.locationName,
            ...(sourceProvider === "dataforseo"
              ? { device: q.device ?? "desktop" }
              : { deviceIndependent: true }),
            sourceProvider,
          };
          if (q.locationName) {
            await assertLocalResearchLocation(
              market.locationCode,
              q.locationName,
            );
          }
          const cacheKey = await buildCacheKey("mcp:serp-results", {
            organizationId: context.billing.organizationId,
            projectId: args.projectId,
            keyword: q.keyword,
            sourceProvider,
            ...market,
            locationName: q.locationName,
            depth,
            device:
              sourceProvider === "dataforseo" && q.device === "mobile"
                ? "mobile"
                : undefined,
          });
          const cached = serpResultsCacheSchema.safeParse(
            await getCached(cacheKey),
          );
          if (cached.success) {
            const cachedItems = Array.isArray(cached.data)
              ? cached.data
              : cached.data.items;
            return {
              keyword: q.keyword,
              ok: true as const,
              items: cachedItems,
              fetchedAt: Array.isArray(cached.data)
                ? undefined
                : cached.data.fetchedAt,
              ...(isFreeRankSource(sourceProvider)
                ? { marketHint: getIsoCountryCode(market.locationCode) }
                : {}),
              ...scope,
            };
          }

          if (isFreeRankSource(sourceProvider) && q.device === "mobile") {
            throw new Error(
              "Free SERP providers (OpenSERP, SerpApi) do not provide device-specific search results.",
            );
          }
          let fetchedAt: string;
          let trimmed: SerpItem[];
          if (isFreeRankSource(sourceProvider)) {
            const snapshot = await searchFreeSerp(sourceProvider, {
              projectId: args.projectId,
              keyword: q.keyword,
              region: getIsoCountryCode(market.locationCode),
              lang: market.languageCode,
              limit: depth,
              locationName: q.locationName,
            });
            fetchedAt = snapshot.fetchedAt;
            trimmed = snapshot.results.map((item) => ({
              type: "organic",
              rank: item.absolutePosition,
              organicRank: item.organicRank,
              title: item.title,
              url: item.url,
              domain: item.hostname,
              description: item.snippet,
            }));
          } else {
            if (!client) {
              throw new Error("DataForSEO client is unavailable.");
            }
            const items = await client.serp.live({
              keyword: q.keyword,
              ...market,
              locationName: q.locationName,
              depth,
              device: q.device,
            });
            fetchedAt = new Date().toISOString();
            trimmed = items.slice(0, depth).map((item) => ({
              type: item.type,
              rank: item.rank_absolute ?? item.rank_group ?? null,
              organicRank:
                item.type === "organic" ? (item.rank_group ?? null) : null,
              title: item.title ?? null,
              url: item.url ?? null,
              domain: item.domain ?? null,
              description: item.description ?? null,
            }));
          }
          // DataForSEO reports "no results" transiently; don't pin that for
          // the whole window. waitUntil, not void: workerd cancels
          // unregistered pending I/O once the response is sent.
          if (trimmed.length > 0) {
            waitUntil(
              setCached(
                cacheKey,
                { items: trimmed, fetchedAt },
                isFreeRankSource(sourceProvider)
                  ? OPEN_SERP_RESULTS_CACHE_TTL_SECONDS
                  : SERP_RESULTS_CACHE_TTL_SECONDS,
              ).catch((error) => {
                console.error("mcp.serp-results.cache-write failed:", error);
              }),
            );
          }
          return {
            keyword: q.keyword,
            ok: true as const,
            items: trimmed,
            fetchedAt,
            marketHint: isFreeRankSource(sourceProvider)
              ? getIsoCountryCode(market.locationCode)
              : undefined,
            ...scope,
          };
        } catch (error) {
          return {
            keyword: q.keyword,
            ok: false as const,
            error: toolErrorMessage(error),
          };
        }
      }),
    );

    const okCount = results.filter((r) => r.ok).length;
    // One budget for the whole response: ten queries split it, so a 10 × depth
    // 100 call can't render 300k characters of text.
    const budget = sectionTableBudget(results.length);
    const text =
      results
        .map((r) => {
          if (!r.ok) {
            return `"${r.keyword}": FAILED — ${r.error}`;
          }
          if (r.items.length === 0) {
            return `"${r.keyword}" (0 results)`;
          }
          return `"${r.keyword}" (${r.items.length} results):\n${formatMcpTable(r.items, SERP_ITEM_COLUMNS, budget)}`;
        })
        .join("\n\n") +
      `\n\n${okCount} of ${results.length} queries succeeded.`;

    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/keywords`,
      ),
      structuredContent: { results },
    });
  }),
};
