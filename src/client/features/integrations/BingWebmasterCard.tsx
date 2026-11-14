import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CardShell } from "@/client/components/CardShell";
import { QueryError } from "@/client/components/QueryState";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { localizeFreeSourceMessage } from "@/client/features/integrations/freeSourceMessages";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import {
  disconnectBingWebmasterFn,
  getFreeSourcesStatusFn,
  listBingWebmasterSitesFn,
  saveBingWebmasterConnectionFn,
} from "@/serverFunctions/free-sources";
import type { FreeSourcesStatus } from "@/shared/free-sources-mode";
import { t } from "@/shared/i18n";

const BING_WEBMASTER_URL = "https://www.bing.com/webmasters";
const BING_DOCS_URL =
  "https://learn.microsoft.com/en-us/bingwebmaster/getting-access";

/**
 * Bing Webmaster connection. The API key is entered here per project (stored
 * encrypted in the database with BETTER_AUTH_SECRET), not as a server env var.
 */
export function BingWebmasterCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["free-sources-status", projectId];
  const statusQuery = useQuery({
    queryKey,
    queryFn: async (): Promise<FreeSourcesStatus> =>
      getFreeSourcesStatusFn({ data: { projectId } }),
  });
  const [apiKey, setApiKey] = useState("");
  const [sites, setSites] = useState<{ url: string }[] | null>(null);
  const [selectedSite, setSelectedSite] = useState("");
  const [manualSite, setManualSite] = useState("");
  // Bing limits the server's shared egress IP (ThrottleIP): verification is
  // blocked, so offer saving without the check.
  const [ipBlocked, setIpBlocked] = useState(false);
  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const listSites = useMutation({
    mutationFn: () =>
      listBingWebmasterSitesFn({ data: { projectId, apiKey: apiKey.trim() } }),
    onSuccess: (result: { url: string }[]) => {
      setSites(result);
      setSelectedSite(result[0]?.url ?? "");
      if (result.length === 0) toast.error(t("freeSources.noVerifiedSites"));
    },
    onError: (error: Error) => {
      setIpBlocked(getErrorCode(error) === "BING_IP_THROTTLED");
      toast.error(getStandardErrorMessage(error));
    },
  });

  const saveBing = useMutation({
    mutationFn: () =>
      saveBingWebmasterConnectionFn({
        data: { projectId, apiKey: apiKey.trim(), siteUrl: selectedSite },
      }),
    onSuccess: (result: { siteUrl: string }) => {
      setApiKey("");
      setSites(null);
      setSelectedSite("");
      toast.success(
        t("freeSources.bingConnectedToast", { url: result.siteUrl }),
      );
      void invalidate();
    },
    onError: (error: Error) => toast.error(getStandardErrorMessage(error)),
  });

  const saveManual = useMutation({
    mutationFn: (skipVerification: boolean) =>
      saveBingWebmasterConnectionFn({
        data: {
          projectId,
          apiKey: apiKey.trim(),
          siteUrl: manualSite.trim(),
          manual: true,
          skipVerification,
        },
      }),
    onSuccess: (result: { siteUrl: string; verified: boolean }) => {
      setApiKey("");
      setSites(null);
      setSelectedSite("");
      setManualSite("");
      setIpBlocked(false);
      toast.success(
        t(
          result.verified
            ? "freeSources.bingConnectedToast"
            : "freeSources.bingConnectedUnverifiedToast",
          { url: result.siteUrl },
        ),
      );
      void invalidate();
    },
    onError: (error: Error) => {
      setIpBlocked(getErrorCode(error) === "BING_IP_THROTTLED");
      toast.error(getStandardErrorMessage(error));
    },
  });

  const disconnectBing = useMutation({
    mutationFn: () => disconnectBingWebmasterFn({ data: { projectId } }),
    onSuccess: () => {
      toast.success(t("freeSources.bingDisconnectedToast"));
      void invalidate();
    },
    onError: (error: Error) => toast.error(getStandardErrorMessage(error)),
  });

  const status = statusQuery.data;
  const bingSnapshot = status?.snapshots.find((row) => row.source === "bing");

  return (
    <CardShell title={t("bing.cardTitle")}>
      {statusQuery.isError ? (
        <QueryError
          error={statusQuery.error}
          fallback={t("freeSources.couldNotLoad")}
          onRetry={() => {
            void statusQuery.refetch();
          }}
          isRetrying={statusQuery.isFetching}
          variant="inline"
        />
      ) : !status ? (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      ) : (
        <div className="space-y-4 text-sm">
          <p>{t("bing.intro")}</p>

          {status.bing.connected ? (
            <div className="space-y-3">
              <p>
                {t("freeSources.bingConnected", {
                  url: status.bing.siteUrl ?? "",
                })}
              </p>
              {bingSnapshot ? (
                <p className="text-muted-foreground">
                  {localizeFreeSourceMessage(bingSnapshot.message)}
                </p>
              ) : null}
              <p className="text-muted-foreground">{t("bing.refreshHint")}</p>
              <Button
                variant="outline"
                onClick={() => disconnectBing.mutate()}
                disabled={disconnectBing.isPending}
              >
                {t("freeSources.disconnectBing")}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="font-medium">{t("bing.howToTitle")}</h3>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>
                    {t("bing.step1")}{" "}
                    <SafeExternalLink
                      url={BING_WEBMASTER_URL}
                      label="Bing Webmaster Tools"
                      className="inline-flex items-center gap-1 underline underline-offset-2"
                    />
                  </li>
                  <li>{t("bing.step2")}</li>
                  <li>{t("bing.step3")}</li>
                  <li>{t("bing.step4")}</li>
                  <li>{t("bing.step5")}</li>
                </ol>
                <p className="text-muted-foreground">
                  {t("bing.keyIsPerUser")}{" "}
                  <SafeExternalLink
                    url={BING_DOCS_URL}
                    label={t("freeSources.microsoftDocs")}
                    className="inline-flex items-center gap-1 underline underline-offset-2"
                  />
                </p>
              </div>

              {!status.bing.canStoreKey ? (
                <p role="alert" className="text-destructive">
                  {t("bing.cannotStoreKey")}
                </p>
              ) : null}

              <div className="space-y-1.5">
                <label htmlFor="bing-api-key" className="font-medium">
                  {t("freeSources.bingApiKey")}
                </label>
                <Input
                  id="bing-api-key"
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(event) => {
                    setApiKey(event.target.value);
                    setSites(null);
                  }}
                  placeholder={t("freeSources.bingApiKeyPlaceholder")}
                />
              </div>
              <Button
                variant="outline"
                onClick={() => listSites.mutate()}
                disabled={
                  !apiKey.trim() ||
                  listSites.isPending ||
                  !status.bing.canStoreKey
                }
              >
                {listSites.isPending
                  ? t("onboarding.checking")
                  : t("freeSources.listVerifiedSites")}
              </Button>
              <div className="space-y-1.5 border-t pt-3">
                <h3 className="font-medium">
                  {t("freeSources.bingManualTitle")}
                </h3>
                <p className="text-muted-foreground">
                  {t("freeSources.bingManualHint")}
                </p>
                <Input
                  id="bing-manual-site"
                  autoComplete="off"
                  value={manualSite}
                  onChange={(event) => setManualSite(event.target.value)}
                  placeholder={t("freeSources.bingManualPlaceholder")}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => saveManual.mutate(false)}
                    disabled={
                      !apiKey.trim() ||
                      !manualSite.trim() ||
                      saveManual.isPending ||
                      !status.bing.canStoreKey
                    }
                  >
                    {saveManual.isPending
                      ? t("onboarding.checking")
                      : t("freeSources.bingManualSave")}
                  </Button>
                  {ipBlocked ? (
                    <Button
                      variant="ghost"
                      onClick={() => saveManual.mutate(true)}
                      disabled={
                        !apiKey.trim() ||
                        !manualSite.trim() ||
                        saveManual.isPending
                      }
                    >
                      {t("freeSources.bingSaveUnverified")}
                    </Button>
                  ) : null}
                </div>
                {ipBlocked ? (
                  <p className="text-muted-foreground">
                    {t("freeSources.bingSaveUnverifiedHint")}
                  </p>
                ) : null}
              </div>
              {sites && sites.length > 0 ? (
                <div className="space-y-1.5">
                  <label htmlFor="bing-site" className="font-medium">
                    {t("freeSources.verifiedSite")}
                  </label>
                  <select
                    id="bing-site"
                    className="border-input bg-background w-full rounded-md border px-3 py-2"
                    value={selectedSite}
                    onChange={(event) => setSelectedSite(event.target.value)}
                  >
                    {sites.map((site) => (
                      <option key={site.url} value={site.url}>
                        {site.url}
                      </option>
                    ))}
                  </select>
                  <Button
                    onClick={() => saveBing.mutate()}
                    disabled={!selectedSite || saveBing.isPending}
                  >
                    {saveBing.isPending
                      ? t("common.saving")
                      : t("freeSources.saveBing")}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </CardShell>
  );
}
