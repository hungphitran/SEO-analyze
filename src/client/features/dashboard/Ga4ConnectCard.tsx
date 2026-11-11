import { useState } from "react";
import { toast } from "sonner";
import { CardShell } from "@/client/components/CardShell";
import { Button } from "@/client/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GoogleConnectionCard } from "@/client/features/integrations/GoogleConnectionCard";
import { captureClientEvent } from "@/client/lib/posthog";
import { dismissDashboardGa4Card } from "@/serverFunctions/dashboard";
import { t } from "@/shared/i18n";

export function Ga4ConnectCard({
  projectId,
  connected,
}: {
  projectId: string;
  connected: boolean;
}) {
  const queryClient = useQueryClient();
  const [usesGa4, setUsesGa4] = useState(false);
  const dismissMutation = useMutation({
    mutationFn: () => dismissDashboardGa4Card({ data: { projectId } }),
    onSuccess: () => {
      toast.success(t("dashboard.useAnotherAnalytics"), {
        description:
          t("dashboard.useAnotherAnalyticsDesc"),
        duration: 10000,
      });
      void queryClient.invalidateQueries({
        queryKey: ["dashboardActivation", projectId],
      });
    },
  });

  if (!connected && !usesGa4)
    return (
      <CardShell title={t("dashboard.doYouUseGa4")}>
        <p className="text-sm text-muted-foreground">
          {t("ui.bringYourOrganicTrafficAndConversions")}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => setUsesGa4(true)}>{t("dashboard.yesConnectGa4")}</Button>
          <Button
            variant="outline"
            disabled={dismissMutation.isPending}
            onClick={() => {
              captureClientEvent("dashboard:ga4_dismiss");
              dismissMutation.mutate();
            }}
          >
            {t("common.no")}
          </Button>
        </div>
      </CardShell>
    );
  return (
    <GoogleConnectionCard
      provider="ga4"
      projectId={projectId}
      prominent
      onDismiss={
        connected
          ? undefined
          : () => {
              captureClientEvent("dashboard:ga4_dismiss");
              dismissMutation.mutate();
            }
      }
      dismissing={dismissMutation.isPending}
    />
  );
}
