import { pageHead } from "@/shared/page-title";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { useState } from "react";
import { ReportsList } from "@/client/features/reports/ReportsList";
import {
  DeleteReportModal,
  reportsQueryKey,
  useDeleteReport,
} from "@/client/features/reports/shared";
import { QueryState } from "@/client/components/QueryState";
import {
  createSummaryReportFn,
  listReports,
  type ReportListItem,
} from "@/serverFunctions/reports";
import { REPORT_APP_LIST_LIMIT } from "@/types/schemas/reports";
import { t } from "@/shared/i18n";

export const Route = createFileRoute("/_app/p/$projectId/reports/")({
  head: pageHead("nav.reports"),
  component: ReportsPage,
});

function ReportsPage() {
  const { projectId } = Route.useParams();
  const [pendingDelete, setPendingDelete] = useState<ReportListItem | null>(
    null,
  );

  const reportsQuery = useQuery({
    queryKey: reportsQueryKey(projectId),
    queryFn: () =>
      listReports({ data: { projectId, limit: REPORT_APP_LIST_LIMIT } }),
    // This page exists to inspect what an agent just wrote; the app-wide
    // 5-minute staleTime would show a pre-save list as current.
    staleTime: 0,
  });

  const queryClient = useQueryClient();
  const summaryMutation = useMutation({
    mutationFn: () => createSummaryReportFn({ data: { projectId } }),
    onSuccess: () => {
      toast.success(t("summaryReport.created"));
      void queryClient.invalidateQueries({
        queryKey: reportsQueryKey(projectId),
      });
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, t("summaryReport.failed"))),
  });

  const deleteMutation = useDeleteReport(projectId, () =>
    setPendingDelete(null),
  );

  return (
    <div className="overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <PageHeader
          title={t("reports.title")}
          description={t("reports.listHint")}
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                title={t("summaryReport.hint")}
                disabled={summaryMutation.isPending}
                onClick={() => summaryMutation.mutate()}
              >
                {summaryMutation.isPending
                  ? t("summaryReport.creating")
                  : t("summaryReport.button")}
              </Button>
              <Button
                variant="ghost"
                nativeButton={false}
                render={
                  <Link
                    to="/p/$projectId/reports/templates"
                    params={{ projectId }}
                  />
                }
              >
                {t("ui.templates")}
              </Button>
            </div>
          }
        />

        <QueryState
          query={reportsQuery}
          errorFallback={t("reports.failedLoad")}
        >
          {(data) => (
            <ReportsList
              projectId={projectId}
              reports={data.reports}
              onDelete={setPendingDelete}
            />
          )}
        </QueryState>
      </div>

      {pendingDelete ? (
        <DeleteReportModal
          title={pendingDelete.title}
          isPending={deleteMutation.isPending}
          onClose={() => setPendingDelete(null)}
          onConfirm={() => deleteMutation.mutate(pendingDelete.id)}
        />
      ) : null}
    </div>
  );
}
