import type { CsvValue } from "@/client/lib/csv";
import { formatPlatformLabel } from "@/client/features/ai-search/platformLabels";
import type { BrandLookupResult } from "@/types/schemas/ai-search";
import { t } from "@/shared/i18n";

type CitationTab = "queries" | "pages";

type PageRow = BrandLookupResult["topPages"][number];
type QueryRow = BrandLookupResult["topQueries"][number];

export function buildBrandLookupExport(
  tab: CitationTab,
  sortedPages: PageRow[],
  sortedQueries: QueryRow[],
): { headers: string[]; rows: CsvValue[][] } {
  if (tab === "pages") {
    return {
      headers: [
        "URL",
        t("common.domain"),
        t("search.platform"),
        t("search.sourceMentions"),
        t("search.sourceAiVolume"),
        t("search.samplePrompts"),
      ],
      rows: sortedPages.map((row) => [
        row.url,
        row.domain ?? "",
        formatPlatformLabel(row.platform),
        row.mentions ?? "",
        row.capturedVolume ?? "",
        row.keywords.map((keyword) => keyword.question).join("; "),
      ]),
    };
  }
  return {
    headers: [
      t("search.query"),
      t("search.platform"),
      t("search.aiSearchVolume"),
      t("search.firstSeen"),
      t("search.lastSeen"),
    ],
    rows: sortedQueries.map((row) => [
      row.question,
      formatPlatformLabel(row.platform),
      row.aiSearchVolume ?? "",
      row.firstSeenAt ?? "",
      row.lastSeenAt ?? "",
    ]),
  };
}

export function brandLookupExportFilename(
  tab: CitationTab,
  resolvedTarget: string,
) {
  const slug = slugify(resolvedTarget);
  return tab === "pages"
    ? `ai-brand-lookup-pages-${slug}`
    : `ai-brand-lookup-queries-${slug}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
