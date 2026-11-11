import { t } from "@/shared/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import { ClaudeIcon, OpenAIIcon } from "@/client/features/ai-mcp/AgentIcons";
import { ONE_CLICK_INSTALLS } from "@/client/features/ai-mcp/agentInstalls";
import { captureClientEvent } from "@/client/lib/posthog";
import { setDashboardStepDismissed } from "@/serverFunctions/dashboard";

export function DashboardAgentCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const dismiss = useMutation({
    mutationFn: () =>
      setDashboardStepDismissed({
        data: { projectId, step: "mcp", dismissed: true },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["dashboardActivation", projectId],
      });
      captureClientEvent("dashboard:setup_step_defer", {
        step: "mcp",
        dismissed: true,
      });
    },
  });

  return (
    <Card
      role="region"
      aria-label={t("dashboard.mcpAria")}
      className="relative flex-row flex-wrap items-center gap-x-6 gap-y-4 p-5 pr-9 shadow-none"
    >
      <div className="flex min-w-0 flex-1 basis-[32rem] items-center gap-4">
        <div className="flex shrink-0 items-center" aria-hidden>
          <span className="flex size-10 items-center justify-center rounded-lg border border-border bg-card">
            <OpenAIIcon className="size-5" />
          </span>
          <span className="-ml-2 mt-3 flex size-10 items-center justify-center rounded-lg border border-border bg-muted">
            <ClaudeIcon className="size-5" />
          </span>
        </div>
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-semibold">
            {t("dashboard.mcpTitle")}
          </h2>
          <p className="truncate text-sm text-muted-foreground">
{t("dashboard.mcpDesc")}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {ONE_CLICK_INSTALLS.map(({ agent, name, href, Icon }) => (
          <Button
            key={agent}
            variant="outline"
            className="h-9 px-3 text-xs sm:text-sm"
            nativeButton={false}
            render={<a href={href} target="_blank" rel="noreferrer" />}
            onClick={() =>
              captureClientEvent("onboarding:add_to_agent_click", {
                agent,
                source: "dashboard",
              })
            }
          >
            <Icon data-icon="inline-start" />
            {t("dashboard.addToAgent", { name })}
          </Button>
        ))}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        className="absolute right-1 top-1 text-muted-foreground"
        aria-label={t("dashboard.dismissChatbotCard")}
        disabled={dismiss.isPending}
        onClick={() => dismiss.mutate()}
      >
        <X />
      </Button>
    </Card>
  );
}
