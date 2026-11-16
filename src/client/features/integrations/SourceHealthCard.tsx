import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CardShell } from "@/client/components/CardShell";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  getSourceHealthFn,
  refreshOwnedSiteSourcesFn,
} from "@/serverFunctions/free-sources";
import type { DataState } from "@/shared/evidence-envelope";
import type { ProjectSourceHealthReport } from "@/shared/free-sources-mode";

const STATE_LABELS: Record<DataState, string> = {
  ok: "Sẵn sàng",
  partial: "Một phần",
  stale: "Dữ liệu cũ (>48h)",
  insufficient_data: "Chưa đủ dữ liệu",
  not_configured: "Chưa cấu hình",
  quota_exceeded: "Vượt hạn mức",
  blocked: "Bị chặn",
  provider_error: "Lỗi nguồn",
  unavailable: "Không khả dụng",
};

const STATE_CLASSES: Record<DataState, string> = {
  ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  partial: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  stale: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  insufficient_data: "bg-muted text-muted-foreground",
  not_configured: "bg-muted text-muted-foreground",
  quota_exceeded: "bg-destructive/15 text-destructive",
  blocked: "bg-destructive/15 text-destructive",
  provider_error: "bg-destructive/15 text-destructive",
  unavailable: "bg-muted text-muted-foreground",
};

export function SourceHealthCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["source-health", projectId];

  const healthQuery = useQuery({
    queryKey,
    queryFn: async (): Promise<ProjectSourceHealthReport> =>
      getSourceHealthFn({ data: { projectId } }),
  });

  const refreshMutation = useMutation({
    mutationFn: () => refreshOwnedSiteSourcesFn({ data: { projectId } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({
          queryKey: ["free-sources-status", projectId],
        }),
      ]);
      toast.success("Đã làm mới trạng thái các nguồn dữ liệu miễn phí.");
    },
    onError: (error) => {
      toast.error(getStandardErrorMessage(error));
    },
  });

  const report = healthQuery.data;

  return (
    <CardShell
      title="Sức khỏe nguồn dữ liệu miễn phí"
      action={
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void healthQuery.refetch()}
            disabled={healthQuery.isFetching}
          >
            {healthQuery.isFetching ? "Đang kiểm tra..." : "Kiểm tra lại"}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
          >
            {refreshMutation.isPending
              ? "Đang đồng bộ..."
              : "Làm mới nguồn sở hữu"}
          </Button>
        </div>
      }
    >
      <p className="text-muted-foreground text-sm mb-4">
        Theo dõi trạng thái cấu hình, độ mới, hạn mức và bước xử lý an toàn cho
        từng nguồn dữ liệu (không hiển thị token).
      </p>
      {healthQuery.isError ? (
        <QueryError
          error={healthQuery.error}
          fallback="Không thể tải trạng thái nguồn dữ liệu."
        />
      ) : !report ? (
        <p className="text-muted-foreground text-sm">
          Đang tải chẩn đoán nguồn dữ liệu...
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>
              Chế độ:{" "}
              <strong className="text-foreground">
                {report.freeSourcesOnly
                  ? "FREE_SOURCES_ONLY (Chặn API trả phí)"
                  : "Tiêu chuẩn"}
              </strong>
            </span>
            <span>•</span>
            <span>
              Lượt gọi trả phí bị chặn:{" "}
              <strong className="text-foreground">
                {report.blockedProviderCallsTotal}
              </strong>
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {report.sources.map((entry) => (
              <div
                key={entry.source}
                className="rounded-lg border p-3 text-sm space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{entry.label}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_CLASSES[entry.state]}`}
                  >
                    {STATE_LABELS[entry.state]}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Phạm vi: {entry.coverage}
                </p>
                <p className="text-xs text-muted-foreground">
                  Hạn mức: {entry.quotaSummary}
                </p>
                {entry.lastSuccessAt && (
                  <p className="text-xs text-muted-foreground">
                    Đồng bộ thành công:{" "}
                    {new Date(entry.lastSuccessAt).toLocaleString("vi-VN")}
                  </p>
                )}
                {entry.lastError && (
                  <p className="text-xs text-destructive">
                    Lỗi gần nhất: {entry.lastError}
                  </p>
                )}
                <p className="text-xs text-foreground/90">
                  Gợi ý: {entry.nextSafeAction}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </CardShell>
  );
}
