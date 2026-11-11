import { Link } from "@tanstack/react-router";
import { Globe, Search } from "lucide-react";
import { EmptyState } from "@/client/components/EmptyState";
import { RecentSearches } from "@/client/components/RecentSearches";
import { getLocationDisplayName } from "@/shared/keyword-locations";
import type { KeywordResearchControllerState } from "./types";
import { t } from "@/shared/i18n";

type Props = {
  controller: KeywordResearchControllerState;
  projectId: string;
};

export function KeywordResearchEmptyState({ controller, projectId }: Props) {
  // The page renders loading and error states before this component.
  if (controller.hasSearched) {
    return <NoResultsState controller={controller} />;
  }

  return <SearchHistoryState controller={controller} projectId={projectId} />;
}

function NoResultsState({
  controller,
}: {
  controller: KeywordResearchControllerState;
}) {
  const { lastSearchKeyword, lastSearchLocationCode } = controller;

  return (
    <div className="mx-auto w-full max-w-2xl pt-1">
      <EmptyState
        variant="card"
        icon={Globe}
        title={t("kw.notEnoughData")}
        description={
          <>
            {t("ui.weCouldNotFindKeywordOpportunities")}
            <span className="font-medium text-foreground">
              {` "${lastSearchKeyword}" `}
            </span>
            {t("ui.in")}
            <span className="font-medium text-foreground">
              {` ${getLocationDisplayName(lastSearchLocationCode) || t("ui.thisLocation")}`}
            </span>
            .
          </>
        }
      />
    </div>
  );
}

function SearchHistoryState({
  controller,
  projectId,
}: {
  controller: KeywordResearchControllerState;
  projectId: string;
}) {
  return (
    <div className="pt-1">
      <RecentSearches
        items={controller.history}
        loaded={controller.historyLoaded}
        onRemove={controller.removeHistoryItem}
        emptyIcon={Search}
        emptyTitle={t("kw.enterToStart")}
        emptyDescription={t("kw.emptyHint")}
        getTitle={(item) => item.keyword}
        getSubtitle={(item) => item.locationName}
        renderLink={(item, props) => (
          <Link
            from="/p/$projectId/keywords"
            to="/p/$projectId/keywords"
            params={{ projectId }}
            search={{
              q: item.keyword,
              loc: item.locationCode,
              locName: item.localLocationName,
              grp: controller.preferredGroupKeywords ? true : undefined,
            }}
            replace
            {...props}
          />
        )}
      />
    </div>
  );
}
