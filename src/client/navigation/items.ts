import {
  Bookmark,
  Bot,
  Brain,
  ChartLine,
  ClipboardCheck,
  FileText,
  Globe,
  LayoutDashboard,
  Link2,
  MessageSquare,
  Search,
  TrendingUp,
} from "lucide-react";
import { linkOptions } from "@tanstack/react-router";
import { GoogleGlyphMuted } from "@/client/features/gsc/GoogleGlyph";
import { t } from "@/shared/i18n";
import { isPaidOnlyNavPath } from "@/shared/free-sources-visibility";

const projectNavItems = [
  {
    to: "/p/$projectId" as const,
    label: t("nav.dashboard"),
    icon: LayoutDashboard,
    // Without exact matching, the index path is a prefix of every project
    // route and the Dashboard item would render active everywhere.
    activeOptions: { exact: true, includeSearch: false },
  },
  {
    to: "/p/$projectId/keywords" as const,
    label: t("nav.keywordResearch"),
    icon: Search,
  },
  {
    to: "/p/$projectId/saved" as const,
    label: t("nav.savedKeywords"),
    icon: Bookmark,
  },
  {
    to: "/p/$projectId/rank-tracking" as const,
    label: t("nav.rankTracking"),
    icon: TrendingUp,
  },
  {
    to: "/p/$projectId/search-performance" as const,
    label: t("nav.gscInsights"),
    icon: GoogleGlyphMuted,
  },
  {
    to: "/p/$projectId/domain" as const,
    label: t("nav.domainOverview"),
    icon: Globe,
  },
  {
    to: "/p/$projectId/backlinks" as const,
    label: t("nav.backlinks"),
    icon: Link2,
  },
  {
    to: "/p/$projectId/audit" as const,
    label: t("nav.siteAudit"),
    icon: ClipboardCheck,
  },
  {
    to: "/p/$projectId/ai-visibility" as const,
    label: t("nav.promptTracking"),
    icon: ChartLine,
    activeOptions: { exact: true, includeSearch: false },
  },
  {
    to: "/p/$projectId/ai-visibility/research" as const,
    label: t("nav.promptResearch"),
    icon: Search,
  },
  {
    to: "/p/$projectId/prompt-explorer" as const,
    label: t("nav.promptExplorer"),
    icon: MessageSquare,
  },
  {
    to: "/p/$projectId/reports" as const,
    label: t("nav.reports"),
    icon: FileText,
  },
  {
    to: "/p/$projectId/context" as const,
    label: t("nav.context"),
    icon: Brain,
  },
] as const;

// Project-independent. Rendered inside the project "AI Tools" group when a project
// is selected, and on its own (connectNavGroup) when none is.
const aiNavItem = linkOptions({
  to: "/ai" as const,
  label: t("nav.agentSetup"),
  icon: Bot,
});

// Shown only when no project is selected; with a project, Agent setup lives in
// the "AI Tools" group below.
export const connectNavGroup = {
  label: t("nav.groupAiTools"),
  items: [aiNavItem],
};

function getProjectNavItems(projectId: string) {
  return linkOptions(
    projectNavItems.map((item) => ({
      ...item,
      params: { projectId },
      search: {},
    })),
  );
}

// Grouped by scope: "My Site" is the project's own domain (tracked data),
// "Research" is point-at-anything lookup tools.
export function getProjectNavGroups(
  projectId: string,
  options: { freeSourcesOnly?: boolean } = {},
) {
  const groups = buildProjectNavGroups(projectId);
  if (!options.freeSourcesOnly) return groups;
  // FREE_SOURCES_ONLY: drop DataForSEO-only items, then any group left empty.
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !isPaidOnlyNavPath(item.to)),
    }))
    .filter((group) => group.items.length > 0);
}

function buildProjectNavGroups(projectId: string) {
  const all = getProjectNavItems(projectId);
  const byPath = (path: (typeof projectNavItems)[number]["to"]) =>
    all.find((i) => i.to === path)!;

  return [
    {
      label: t("nav.groupOverview"),
      items: [byPath("/p/$projectId")],
    },
    {
      label: t("nav.groupResearch"),
      items: [
        byPath("/p/$projectId/keywords"),
        byPath("/p/$projectId/domain"),
        byPath("/p/$projectId/backlinks"),
      ],
    },
    {
      label: t("nav.groupAiVisibility"),
      items: [
        byPath("/p/$projectId/ai-visibility/research"),
        byPath("/p/$projectId/prompt-explorer"),
        byPath("/p/$projectId/ai-visibility"),
      ],
    },
    {
      label: t("nav.groupMySite"),
      items: [
        byPath("/p/$projectId/search-performance"),
        byPath("/p/$projectId/rank-tracking"),
        byPath("/p/$projectId/saved"),
        byPath("/p/$projectId/audit"),
      ],
    },
    {
      label: t("nav.groupAiTools"),
      items: [
        byPath("/p/$projectId/reports"),
        byPath("/p/$projectId/context"),
        aiNavItem,
      ],
    },
  ];
}

export const dataforseoHelpLinkOptions = linkOptions({
  to: "/help/dataforseo-api-key",
});
