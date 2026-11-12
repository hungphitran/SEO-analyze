import { z } from "zod";

export const organicResultSchema = z
  .object({
    position: z.number().int().positive().optional(),
    title: z.string().nullish(),
    link: z.string().nullish(),
    snippet: z.string().nullish(),
  })
  .passthrough();

export const responseSchema = z
  .object({
    search_metadata: z
      .object({ id: z.string().optional(), status: z.string().optional() })
      .passthrough()
      .optional(),
    error: z.string().optional(),
    organic_results: z.array(organicResultSchema).optional(),
  })
  .passthrough();

// SerpApi response key -> the normalized SERP feature name used by the UI.
export const FEATURE_KEYS: Record<string, string> = {
  answer_box: "featured_snippet",
  related_questions: "people_also_ask",
  knowledge_graph: "knowledge_graph",
  local_results: "local_pack",
  top_stories: "top_stories",
  inline_videos: "video",
  video_results: "video",
  inline_images: "images",
  images_results: "images",
  shopping_results: "shopping",
  ads: "paid",
  related_searches: "related_searches",
};

export function isNonEmpty(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && typeof value === "object"
    ? Object.keys(value).length > 0
    : Boolean(value);
}


export function normalizeHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^www\./, "");
  return normalized.endsWith(".") ? normalized.slice(0, -1) : normalized;
}
