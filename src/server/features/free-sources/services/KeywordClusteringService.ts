import { sort } from "remeda";

export const CLUSTERING_ALGORITHM_VERSION = "rules-v1.0";

export type KeywordIntent =
  | "informational"
  | "commercial"
  | "transactional"
  | "navigational"
  | "unknown";

/** Normalizes Vietnamese diacritics and punctuation for deterministic clustering. */
export function normalizeKeywordTokens(text: string): string[] {
  const stripped = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");
  const stopWords = new Set([
    "la",
    "gi",
    "nhu",
    "the",
    "nao",
    "cach",
    "cho",
    "cua",
    "va",
    "a",
    "an",
    "for",
    "to",
    "in",
    "of",
    "how",
    "what",
  ]);
  return stripped
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !stopWords.has(t));
}

export function classifyKeywordIntent(query: string): KeywordIntent {
  const norm = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
  if (
    /\b(mua|gia|bao gia|dat hang|buy|price|pricing|discount|coupon)\b/.test(
      norm,
    )
  ) {
    return "transactional";
  }
  if (
    /\b(so sanh|review|danh gia|top|tot nhat|best|vs|compare|alternative)\b/.test(
      norm,
    )
  ) {
    return "commercial";
  }
  if (
    /\b(la gi|cach|huong dan|tai sao|how to|what is|guide|tutorial)\b/.test(
      norm,
    )
  ) {
    return "informational";
  }
  if (/\b(login|dang nhap|trang chu|official|app)\b/.test(norm)) {
    return "navigational";
  }
  return "unknown";
}

function clusterConfidence(count: number): "high" | "medium" | "low" {
  if (count >= 3) return "high";
  if (count === 2) return "medium";
  return "low";
}

export function clusterQueriesByRules(
  queries: Array<{ query: string; source: string }>,
): Array<{
  id: string;
  name: string;
  intent: KeywordIntent;
  algorithmVersion: string;
  confidence: "high" | "medium" | "low";
  evidenceCount: number;
  members: Array<{ query: string; source: string }>;
}> {
  const seen = new Map<string, { query: string; source: string }>();
  for (const item of queries) {
    if (!seen.has(item.query)) seen.set(item.query, item);
  }
  const unique = Array.from(seen.values());
  const groups = new Map<string, Array<{ query: string; source: string }>>();

  for (const item of unique) {
    const tokens = normalizeKeywordTokens(item.query);
    const key =
      sort(tokens.slice(0, 2), (a, b) => a.localeCompare(b)).join(" ") ||
      item.query.toLowerCase();
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  return sort(
    Array.from(groups.entries()).map(([key, members]) => ({
      id: crypto.randomUUID(),
      name: key,
      intent: classifyKeywordIntent(members[0].query),
      algorithmVersion: CLUSTERING_ALGORITHM_VERSION,
      confidence: clusterConfidence(members.length),
      evidenceCount: members.length,
      members,
    })),
    (a, b) => b.evidenceCount - a.evidenceCount,
  );
}
