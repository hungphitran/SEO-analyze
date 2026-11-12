import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CardShell } from "@/client/components/CardShell";
import { QueryError } from "@/client/components/QueryState";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import { Button } from "@/client/components/ui/button";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  getFreeSourcesStatusFn,
  refreshOwnedSiteSourcesFn,
} from "@/serverFunctions/free-sources";
import type {
  FreeSourceSnapshotView,
  FreeSourcesStatus,
} from "@/shared/free-sources-mode";
import { t } from "@/shared/i18n";
import { CruxVitalsPanel } from "@/client/features/integrations/CruxVitalsPanel";
import { localizeFreeSourceMessage } from "@/client/features/integrations/freeSourceMessages";

function StatusBadge({ status }: { status: FreeSourceSnapshotView["status"] }) {
  const label =
    status === "ok"
      ? t("freeSources.statusUpdated")
      : status === "skipped"
        ? t("freeSources.statusSkipped")
        : t("freeSources.statusError");
  return (
    <span className="text-muted-foreground text-sm font-medium">{label}</span>
  );
}

export function FreeSourcesCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["free-sources-status", projectId];
  const statusQuery = useQuery({
    queryKey,
    queryFn: async (): Promise<FreeSourcesStatus> =>
      getFreeSourcesStatusFn({
        data: { projectId },
      }),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const refresh = useMutation({
    mutationFn: () => refreshOwnedSiteSourcesFn({ data: { projectId } }),
    onSuccess: () => {
      toast.success(t("freeSources.refreshedToast"));
      void invalidate();
    },
    onError: (error: Error) => {
      toast.error(getStandardErrorMessage(error));
    },
  });

  const status = statusQuery.data;

  return (
    <CardShell title={t("freeSources.cardTitle")}>
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
        <div className="space-y-5 text-sm">
          <p>
            {t("freeSources.intro")} {status.limitations}
          </p>
          {status.freeSourcesOnly ? <p>{t("freeSources.freeOnlyOn")}</p> : null}

          <ul className="space-y-2">
            <li>
              <strong>{t("freeSources.gscName")}</strong>{" "}
              {status.googleSearchConsole.connected
                ? t("freeSources.gscConnected", {
                    url: status.googleSearchConsole.siteUrl ?? "",
                  })
                : status.googleSearchConsole.configured
                  ? t("freeSources.gscOauthReady")
                  : t("freeSources.gscNotConfigured")}
            </li>
            <li>
              <strong>{t("freeSources.psiName")}</strong>{" "}
              {status.pagespeed.configured
                ? t("freeSources.psiConfigured")
                : t("freeSources.psiNotConfigured")}
            </li>
            <li>
              <strong>{t("freeSources.cruxName")}</strong>{" "}
              {status.crux.configured
                ? t("freeSources.cruxConfigured")
                : t("freeSources.cruxNotConfigured")}
            </li>
            <li>
              <strong>{t("freeSources.oprName")}</strong>{" "}
              {status.openPageRank.configured
                ? t("freeSources.oprConfigured")
                : t("freeSources.oprNotConfigured")}
            </li>
            <li>
              <strong>{t("freeSources.bingName")}</strong>{" "}
              {status.bing.connected
                ? t("freeSources.bingConnected", {
                    url: status.bing.siteUrl ?? "",
                  })
                : t("freeSources.bingNotConnectedSeeCard")}
            </li>
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
            >
              {refresh.isPending
                ? t("common.refreshing")
                : t("freeSources.refreshData")}
            </Button>
            <span className="text-muted-foreground">
              {t("freeSources.noAutoPagespeed")}
            </span>
          </div>

          {status.snapshots.length > 0 ? (
            <div className="space-y-3">
              <h3 className="font-medium">{t("freeSources.latestResults")}</h3>
              {status.snapshots.map((snapshot) => (
                <div key={snapshot.source} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <strong>{snapshot.label}</strong>
                    <StatusBadge status={snapshot.status} />
                  </div>
                  <p className="text-muted-foreground">
                    {localizeFreeSourceMessage(snapshot.message)}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {status.crux.configured ? (
            <CruxVitalsPanel projectId={projectId} />
          ) : null}

          <p className="text-muted-foreground">
            {t("freeSources.setupDocsPrefix")}{" "}
            <SafeExternalLink
              url="https://developers.google.com/speed/docs/insights/v5/get-started"
              label={t("freeSources.googleDocs")}
              className="inline-flex items-center gap-1 underline underline-offset-2"
            />
            {t("freeSources.setupDocsMid")}{" "}
            <SafeExternalLink
              url="https://learn.microsoft.com/en-us/bingwebmaster/getting-access"
              label={t("freeSources.microsoftDocs")}
              className="inline-flex items-center gap-1 underline underline-offset-2"
            />
            .
          </p>
        </div>
      )}
    </CardShell>
  );
}
