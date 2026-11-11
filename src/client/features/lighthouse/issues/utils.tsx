import type { CsvValue } from "@/client/lib/csv";
import type { CategoryTab, LighthouseIssue } from "./types";
import { t } from "@/shared/i18n";

const ISSUE_HEADERS = [
  t("audit.category"),
  t("common.severity"),
  t("kw.score"),
  t("common.title"),
  t("audit.displayValue"),
  t("common.description"),
  t("audit.impactMs"),
  t("audit.impactBytes"),
  t("audit.affectedItems"),
];

function issuesToRows(issues: LighthouseIssue[]): CsvValue[][] {
  return issues.map((issue) => [
    issue.category,
    issue.severity,
    issue.score ?? "",
    issue.title,
    issue.displayValue ?? "",
    issue.description ?? "",
    issue.impactMs ?? "",
    issue.impactBytes ?? "",
    issue.items.length,
  ]);
}

export function issuesToTable(issues: LighthouseIssue[]) {
  return { headers: ISSUE_HEADERS, rows: issuesToRows(issues) };
}

export function categoryLabel(category: CategoryTab) {
  if (category === "best-practices") return t("audit.bestPracticesLower");
  if (category === "all") return t("audit.allCategories");
  if (category === "performance") return t("audit.performance");
  if (category === "accessibility") return t("audit.accessibility");
  if (category === "seo") return t("audit.seo");
  return category;
}
