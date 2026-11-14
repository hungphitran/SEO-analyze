import { ExternalLink, MessageSquare, RefreshCw } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { safeHttpUrl } from "@/shared/safe-url";
import type { SearchConsoleData } from "@/shared/mcp-contracts";
import type { WidgetHost } from "./useWidgetHost";
import { t } from "@/shared/i18n";

export function SearchConsoleConnection({
  host,
  data,
}: {
  host: WidgetHost;
  data: SearchConsoleData;
}) {
  const input = host.snapshot!.context.arguments;
  const busy = host.action.isPending;
  const connectUrl = safeHttpUrl(data.connectUrl);
  const setupUrl = safeHttpUrl(data.setupDocsUrl);
  const connection = data.reason === "not_connected" || data.connectionRequired;
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h1 className="text-xl font-semibold">
          {setupUrl
            ? t("ui.setUpGoogleSearchConsole")
            : connection
              ? t("ui.connectGoogleSearchConsole")
              : t("ui.couldnTLoadSearchConsoleData")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {setupUrl
            ? "This self-hosted OpenSEO instance needs Google OAuth configuration before you can connect a property."
            : connection
              ? t("ui.connectGoogleAndChooseASearch")
              : host.snapshot?.text}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(connectUrl || setupUrl) && (
          <Button
            disabled={busy}
            onClick={() => host.open((setupUrl ?? connectUrl)!)}
          >
            {setupUrl
              ? t("ui.setupInstructions")
              : connection
                ? t("ui.connectInOpenseo")
                : t("ui.checkConnectionInOpenseo")}
            <ExternalLink />
          </Button>
        )}
        <Button
          variant="outline"
          pending={busy}
          onClick={() => host.call(host.snapshot!.context)}
        >
          <RefreshCw />
          {connection ? t("ui.checkConnection") : t("common.tryAgain")}
        </Button>
      </div>
      <div className="border-t border-border pt-4">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            host.ask(t("ui.helpMeResearchGoogleSearchResults"), {
              projectId: input.projectId,
            })
          }
        >
          <MessageSquare />
          {t("ui.researchAKeywordInstead")}
        </Button>
      </div>
    </section>
  );
}
