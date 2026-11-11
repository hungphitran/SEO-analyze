import type { CsvValue } from "@/client/lib/csv";
import type {
  BacklinksSearchState,
  BacklinksTabRows,
} from "./backlinksPageTypes";
import type { DomainRatings } from "./useAhrefsDomainRatings";
import { t } from "@/shared/i18n";

/**
 * Builds the export table for the active tab. When `domainRatings` is loaded
 * (the user clicked "Ahrefs DR"), an Ahrefs DR column is included for the
 * Backlinks and Referring Domains tabs, matching the on-screen table.
 */
export function buildBacklinksTabExport(args: {
  tab: BacklinksSearchState["tab"];
  rows: BacklinksTabRows;
  domainRatings?: DomainRatings | null;
}): { headers: string[]; rows: CsvValue[][] } {
  const { tab, rows, domainRatings } = args;
  const ratingFor = (domain: string | null | undefined): CsvValue => {
    if (!domainRatings || !domain) return null;
    return domainRatings[domain.replace(/^www\./, "")] ?? null;
  };

  if (tab === "backlinks") {
    return {
      headers: [
        t("common.domain"),
        t("backlinks.sourceUrl"),
        t("backlinks.targetUrl"),
        t("backlinks.anchor"),
        t("common.type"),
        t("backlinks.dofollow"),
        t("backlinks.relAttributes"),
        t("backlinks.domainRank"),
        ...(domainRatings ? [t("backlinks.ahrefsDr")] : []),
        t("backlinks.sourcePageRank"),
        t("backlinks.targetRank"),
        t("backlinks.spamScore"),
        t("backlinks.firstSeen"),
        t("backlinks.lastSeen"),
        t("backlinks.lost"),
        t("backlinks.broken"),
        t("backlinks.linksCount"),
      ],
      rows: rows.backlinks.map((row) => [
        row.domainFrom,
        row.urlFrom,
        row.urlTo,
        row.anchor,
        row.itemType,
        row.isDofollow,
        row.relAttributes.join(", "),
        row.domainFromRank,
        ...(domainRatings ? [ratingFor(row.domainFrom)] : []),
        row.pageFromRank,
        row.rank,
        row.spamScore,
        row.firstSeen,
        row.lastSeen,
        row.isLost,
        row.isBroken,
        row.linksCount,
      ]),
    };
  }

  if (tab === "domains") {
    return {
      headers: [
        t("common.domain"),
        t("backlinks.title"),
        t("backlinks.referringPages"),
        t("metrics.rank"),
        ...(domainRatings ? [t("backlinks.ahrefsDr")] : []),
        t("backlinks.spamScore"),
        t("backlinks.firstSeen"),
        t("backlinks.brokenBacklinks"),
        t("backlinks.brokenPages"),
      ],
      rows: rows.referringDomains.map((row) => [
        row.domain,
        row.backlinks,
        row.referringPages,
        row.rank,
        ...(domainRatings ? [ratingFor(row.domain)] : []),
        row.spamScore,
        row.firstSeen,
        row.brokenBacklinks,
        row.brokenPages,
      ]),
    };
  }

  return {
    headers: [
      t("common.pageNoun"),
      t("backlinks.title"),
      t("backlinks.referringDomains"),
      t("metrics.rank"),
      t("backlinks.brokenBacklinks"),
    ],
    rows: rows.topPages.map((row) => [
      row.page,
      row.backlinks,
      row.referringDomains,
      row.rank,
      row.brokenBacklinks,
    ]),
  };
}

export function buildBacklinksTabFilename(
  tab: BacklinksSearchState["tab"],
  target: string,
) {
  const tabPrefix =
    tab === "backlinks"
      ? "backlinks"
      : tab === "domains"
        ? "referring-domains"
        : "top-pages";
  const normalizedTarget = target
    .toLowerCase()
    .trim()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `backlinks-${tabPrefix}${normalizedTarget ? `-${normalizedTarget}` : ""}`;
}
