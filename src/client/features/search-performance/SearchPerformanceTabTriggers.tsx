import { TabsTrigger } from "@/client/components/ui/tabs";
import { t } from "@/shared/i18n";

/** Every tab of the Search Performance page, in display order. */
export function SearchPerformanceTabTriggers({
  strikingLabel,
}: {
  strikingLabel: string;
}) {
  return (
    <>
      <TabsTrigger value="striking">{strikingLabel}</TabsTrigger>
      <TabsTrigger value="queries">{t("gscInsights.queries")}</TabsTrigger>
      <TabsTrigger value="pages">{t("gscInsights.pages")}</TabsTrigger>
      <TabsTrigger value="countries">{t("gscDetail.tabCountries")}</TabsTrigger>
      <TabsTrigger value="devices">{t("gscDetail.tabDevices")}</TabsTrigger>
      <TabsTrigger value="dates">{t("gscDetail.tabDates")}</TabsTrigger>
      <TabsTrigger value="appearance">
        {t("gscDetail.tabAppearance")}
      </TabsTrigger>
      <TabsTrigger value="cannibalization">
        {t("gscInsights.cannibalization")}
      </TabsTrigger>
      <TabsTrigger value="declining">{t("gscInsights.declining")}</TabsTrigger>
      <TabsTrigger value="sitemaps">{t("gscDetail.tabSitemaps")}</TabsTrigger>
      <TabsTrigger value="inspection">
        {t("gscDetail.tabInspection")}
      </TabsTrigger>
    </>
  );
}
