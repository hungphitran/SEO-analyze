import { createFileRoute } from "@tanstack/react-router";
import {
  CommandBlock,
  helpLinkClassName,
  SecretHelpPage,
} from "@/client/features/help/SecretHelpPage";
import { t } from "@/shared/i18n";

const DATAFORSEO_API_ACCESS_URL = "https://app.dataforseo.com/api-access";

export const Route = createFileRoute("/_app/help/dataforseo-api-key")({
  component: DataforseoApiKeyHelpPage,
});

function DataforseoApiKeyHelpPage() {
  const requestStep = (
    <li>
      {t("help.dfsGoToBefore")}{" "}
      <a
        className={helpLinkClassName}
        href={DATAFORSEO_API_ACCESS_URL}
        target="_blank"
        rel="noreferrer"
      >
        {t("ui.dataforseoApiAccess")}
      </a>{" "}
      {t("help.dfsGoToAfter")}
    </li>
  );
  const encodeStep = (
    <li>
      {t("help.dfsEncode")}
      <CommandBlock command="printf '%s' 'YOUR_LOGIN:YOUR_PASSWORD' | base64" />
    </li>
  );
  return (
    <SecretHelpPage
      title={t("help.dataforseoHeading")}
      intro={t("help.dfsIntro")}
      everyAppIntro={t("help.dfsEveryAppIntro")}
      secretName="DATAFORSEO_API_KEY"
      steps={
        <>
          {requestStep}
          {encodeStep}
          <li>{t("help.dfsSaveSecret")}</li>
        </>
      }
      everyAppSteps={
        <>
          {requestStep}
          {encodeStep}
          <li>
            {t("help.dfsEveryAppRun")}
            <CommandBlock command="pnpm everyapp secret set DATAFORSEO_API_KEY" />
          </li>
          <li>{t("help.dfsReload")}</li>
        </>
      }
      dashboardPasteStep={t("help.dfsDashboardPaste")}
      terminalPromptHint={t("help.dfsTerminalHint")}
    />
  );
}
