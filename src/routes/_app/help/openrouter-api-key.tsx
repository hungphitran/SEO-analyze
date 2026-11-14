import { createFileRoute } from "@tanstack/react-router";
import {
  CommandBlock,
  helpLinkClassName,
  SecretHelpPage,
} from "@/client/features/help/SecretHelpPage";
import { t } from "@/shared/i18n";

const OPENROUTER_KEYS_URL = "https://openrouter.ai/settings/keys";

export const Route = createFileRoute("/_app/help/openrouter-api-key")({
  component: OpenrouterApiKeyHelpPage,
});

function OpenrouterApiKeyHelpPage() {
  const accountStep = (
    <li>
      {t("help.orCreateBefore")}{" "}
      <a
        className={helpLinkClassName}
        href="https://openrouter.ai"
        target="_blank"
        rel="noreferrer"
      >
        openrouter.ai
      </a>{" "}
      {t("help.orCreateAfter")}
    </li>
  );
  const keyStep = (
    <li>
      {t("help.orGoBefore")}{" "}
      <a
        className={helpLinkClassName}
        href={OPENROUTER_KEYS_URL}
        target="_blank"
        rel="noreferrer"
      >
        {t("ui.openrouterApiKeys")}
      </a>{" "}
      {t("help.orGoAfter")}
    </li>
  );
  return (
    <SecretHelpPage
      title={t("help.openrouterHeading")}
      intro={t("help.orIntro")}
      everyAppIntro={t("help.orEveryAppIntro")}
      secretName="OPENROUTER_API_KEY"
      steps={
        <>
          {accountStep}
          {keyStep}
          <li>
            {t("help.orSaveSecret")}
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>{t("help.orDockerEnv", { file: ".env" })}</li>
              <li>{t("help.orCloudflareUi")}</li>
              <li>{t("help.orLocalEnv", { file: ".env.local" })}</li>
            </ul>
          </li>
          <li>{t("help.orRestart")}</li>
        </>
      }
      everyAppSteps={
        <>
          {accountStep}
          {keyStep}
          <li>
            {t("help.orEveryAppRun")}
            <CommandBlock command="pnpm everyapp secret set OPENROUTER_API_KEY" />
          </li>
          <li>{t("help.orReload")}</li>
        </>
      }
      dashboardPasteStep={t("help.orDashboardPaste")}
      terminalPromptHint={t("help.orTerminalHint")}
    />
  );
}
