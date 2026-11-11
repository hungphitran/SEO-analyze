import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { AuditHistorySection } from "@/client/features/audit/launch/AuditHistorySection";
import { LaunchFormCard } from "@/client/features/audit/launch/LaunchFormCard";
import { useLaunchController } from "@/client/features/audit/launch/useLaunchController";
import { useHostedPlanGate } from "@/client/features/billing/HostedPlanGate";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import {
  RENDERING_COST_NOTE,
  renderingCostText,
} from "@/shared/audit-rendering";
import { formatUiNumber, t } from "@/shared/i18n";

type LaunchViewProps = {
  projectId: string;
  initialUrl: string;
  onAuditStarted: (auditId: string) => void;
};

export function LaunchView({
  projectId,
  initialUrl,
  onAuditStarted,
}: LaunchViewProps) {
  // The plan only sets the page limit, so the form stays usable while the
  // plan loads. The server enforces the limit regardless.
  const isFreePlan = useHostedPlanGate() === "free";
  const controller = useLaunchController({
    projectId,
    initialUrl,
    isFreePlan,
    onAuditStarted,
  });

  return (
    <div className="px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-4">
        <PageHeader title={t("nav.siteAudit")} />

        <LaunchFormCard
          launchForm={controller.launchForm}
          commitMaxPagesInput={controller.commitMaxPagesInput}
          maxPagesLimit={controller.maxPagesLimit}
          canRenderJavaScript={controller.canRenderJavaScript}
          outOfCredits={controller.outOfCredits}
        />

        <AuditHistorySection
          projectId={projectId}
          historyQuery={controller.historyQuery}
          onDelete={controller.deleteAudit}
        />

        {controller.largeCrawlPages != null ? (
          <LargeCrawlDialog
            pages={controller.largeCrawlPages}
            renderJavaScript={controller.renderJavaScript}
            onConfirm={controller.confirmLargeCrawl}
            onClose={controller.cancelLargeCrawl}
          />
        ) : null}
      </div>
    </div>
  );
}

function LargeCrawlDialog({
  pages,
  renderJavaScript,
  onConfirm,
  onClose,
}: {
  pages: number;
  renderJavaScript: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const pageCount = formatUiNumber(pages);
  // Only hosted plans pay for rendering, so only they see a price.
  const priced = renderJavaScript && isHostedClientAuthMode();
  return (
    <ConfirmDialog
      title={
        priced
          ? t("audit.renderUpToPages", { count: pageCount })
          : t("audit.largeAuditTitle")
      }
      confirmLabel={priced ? t("audit.startAudit") : t("common.continue")}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      {priced ? (
        <>
          {RENDERING_COST_NOTE} {t("audit.renderedCanTakeLonger")}
          <span className="mt-3 block font-semibold text-foreground">
            {renderingCostText(pages)}
          </span>
        </>
      ) : (
        t("audit.crawlConfirm", { count: pageCount })
      )}
    </ConfirmDialog>
  );
}
