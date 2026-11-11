import { NavTab, NavTabs } from "@/client/components/NavTabs";
import { t } from "@/shared/i18n";

const tabs = [
  { to: "/p/$projectId/settings" as const, label: t("settings.general"), exact: true },
  { to: "/p/$projectId/settings/integrations" as const, label: t("settings.integrations") },
];

export function SettingsTabs({ projectId }: { projectId: string }) {
  return (
    <NavTabs label={t("settings.projectSectionsAria")}>
      {tabs.map((tab) => (
        <NavTab
          key={tab.to}
          to={tab.to}
          params={{ projectId }}
          activeOptions={{ exact: tab.exact ?? false }}
        >
          {tab.label}
        </NavTab>
      ))}
    </NavTabs>
  );
}
