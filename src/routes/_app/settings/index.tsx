import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ApiKeySettings } from "@/client/features/settings/ApiKeySettings";
import { SectionHeader } from "@/client/components/PageHeader";
import { ThemePreferenceRadio } from "@/client/components/ThemePreferenceMenuItems";
import { everyAppAccountQueryOptions } from "@/client/features/every-app/everyAppAccountQueries";
import { McpConnectionsSettings } from "@/client/features/settings/McpConnectionsSettings";
import { PrivacySettings } from "@/client/features/settings/PrivacySettings";
import {
  isEveryAppClientAuthMode,
  isHostedClientAuthMode,
  usesBetterAuthClient,
} from "@/lib/auth-mode";
import { version } from "../../../../package.json";
import { t } from "@/shared/i18n";

export const Route = createFileRoute("/_app/settings/")({
  component: PersonalSettings,
});

function PersonalSettings() {
  const isHosted = isHostedClientAuthMode();
  // API keys need Better Auth accounts (hosted or the standalone Docker
  // edition); the analytics choices only exist on hosted.
  const hasAccounts = usesBetterAuthClient();
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <SectionHeader title={t("settings.appearance")} />
        <div className="flex items-center justify-between gap-6">
          <span className="text-sm">{t("theme.label")}</span>
          <ThemePreferenceRadio />
        </div>
      </section>

      {isEveryAppClientAuthMode() ? <EveryAppSettings /> : null}

      {isHosted ? <McpConnectionsSettings /> : null}

      {hasAccounts ? <ApiKeySettings /> : null}

      {isHosted ? (
        <PrivacySettings />
      ) : (
        <section className="space-y-3">
          <SectionHeader title={t("settings.about")} />
          <div className="flex items-center justify-between gap-6">
            <span className="text-sm">{t("settings.version")}</span>
            <span className="font-mono text-sm text-muted-foreground">
              v{version}
            </span>
          </div>
        </section>
      )}
    </div>
  );
}

// Behind an Every App gateway, which owns the account, the team and the AI
// connections: say so, and link back.
function EveryAppSettings() {
  const { data: account } = useQuery(everyAppAccountQueryOptions());
  return (
    <section className="space-y-3">
      <SectionHeader title={t("settings.everyApp")} />
      <p className="text-sm text-muted-foreground">
        {t("settings.everyAppBody")}
      </p>
      {account?.gatewayUrl ? (
        <a
          href={account.gatewayUrl}
          className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {t("settings.openEveryApp")}
        </a>
      ) : null}
    </section>
  );
}
