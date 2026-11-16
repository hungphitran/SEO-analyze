import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { CardShell } from "@/client/components/CardShell";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  commitGeoCsvFn,
  getGeoEvidenceFn,
  previewGeoCsvFn,
  rollbackGeoBatchFn,
} from "@/serverFunctions/free-sources-analytics";

export const Route = createFileRoute("/_app/p/$projectId/geo-evidence")({
  component: GeoEvidenceRoute,
});

function GeoEvidenceRoute() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const [source, setSource] = useState<"bing_ai_csv" | "google_genai_csv">(
    "bing_ai_csv",
  );
  const [filename, setFilename] = useState("geo-export.csv");
  const [csvText, setCsvText] = useState("");
  const [allowOutOfScope, setAllowOutOfScope] = useState(false);

  const summaryQuery = useQuery({
    queryKey: ["geo-evidence", projectId],
    queryFn: () => getGeoEvidenceFn({ data: { projectId } }),
  });

  const previewMutation = useMutation({
    mutationFn: () =>
      previewGeoCsvFn({
        data: { projectId, source, csvText },
      }),
    onError: (err) => toast.error(getStandardErrorMessage(err)),
  });

  const commitMutation = useMutation({
    mutationFn: () =>
      commitGeoCsvFn({
        data: {
          projectId,
          source,
          reportType:
            source === "bing_ai_csv"
              ? "bing_ai_performance"
              : "gsc_genai_performance",
          filename,
          csvText,
          allowOutOfScope,
        },
      }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({
        queryKey: ["geo-evidence", projectId],
      });
      toast.success(
        `Đã nhập ${res.insertedCount} dòng mới (${res.deduplicatedCount} dòng trùng đã bỏ qua).`,
      );
      setCsvText("");
      previewMutation.reset();
    },
    onError: (err) => toast.error(getStandardErrorMessage(err)),
  });

  const rollbackMutation = useMutation({
    mutationFn: (batchId: string) =>
      rollbackGeoBatchFn({ data: { projectId, batchId } }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({
        queryKey: ["geo-evidence", projectId],
      });
      toast.success(`Đã hoàn tác batch (${res.deletedCount} dòng đã xóa).`);
    },
    onError: (err) => toast.error(getStandardErrorMessage(err)),
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Tệp CSV vượt quá giới hạn 5 MB.");
      return;
    }
    setFilename(file.name);
    setCsvText(await file.text());
  };

  const summary = summaryQuery.data;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">
          Bằng chứng GEO / AI (Nhập CSV chính thức)
        </h1>
        <p className="text-sm text-muted-foreground">
          Tách biệt hoàn toàn Bing AI Citations và Google Generative AI
          Impressions. Không gọi LLM trả phí và không cộng gộp hai chỉ số khác
          ngữ nghĩa.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CardShell title="Bing AI Performance (Trích dẫn AI)">
          {summary ? (
            <div className="space-y-1 text-sm">
              <div className="text-2xl font-semibold">
                {summary.bingAi.totalCitations.toLocaleString("vi-VN")}
              </div>
              <p className="text-xs text-muted-foreground">
                Tổng citations quan sát được •{" "}
                {summary.bingAi.distinctCitedPages} trang được trích dẫn •
                Trạng thái: {summary.bingAi.completeness}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Đang tải...</p>
          )}
        </CardShell>

        <CardShell title="Google Generative AI (Impressions AI)">
          {summary ? (
            <div className="space-y-1 text-sm">
              <div className="text-2xl font-semibold">
                {summary.googleGenAi.totalImpressions.toLocaleString("vi-VN")}
              </div>
              <p className="text-xs text-muted-foreground">
                Tổng AI impressions theo GSC •{" "}
                {summary.googleGenAi.distinctPages} trang • Trạng thái:{" "}
                {summary.googleGenAi.completeness}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Đang tải...</p>
          )}
        </CardShell>
      </div>

      <CardShell title="Nhập báo cáo CSV từ Bing Webmaster / Search Console">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="rounded-md border bg-background px-3 py-1.5 text-sm"
              value={source}
              onChange={(e) =>
                setSource(
                  e.target.value === "google_genai_csv"
                    ? "google_genai_csv"
                    : "bing_ai_csv",
                )
              }
              aria-label="Chọn nguồn báo cáo GEO"
            >
              <option value="bing_ai_csv">
                Bing Webmaster AI Performance (Citations)
              </option>
              <option value="google_genai_csv">
                Google Search Console GenAI (Impressions)
              </option>
            </select>

            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => void handleFileChange(e)}
              className="text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!csvText || previewMutation.isPending}
              onClick={() => previewMutation.mutate()}
            >
              {previewMutation.isPending ? "Đang kiểm tra..." : "Xem trước 20 dòng"}
            </Button>
            <Button
              type="button"
              disabled={!csvText || commitMutation.isPending}
              onClick={() => commitMutation.mutate()}
            >
              {commitMutation.isPending ? "Đang nhập..." : "Xác nhận nhập CSV"}
            </Button>
          </div>

          {previewMutation.data && (
            <div className="rounded-md border p-3 text-xs space-y-2">
              <div>
                Hợp lệ: <strong>{previewMutation.data.validRows.length}</strong>{" "}
                dòng • Lỗi: <strong>{previewMutation.data.invalidRowCount}</strong>{" "}
                • Ngoài domain dự án:{" "}
                <strong>{previewMutation.data.outOfScopeCount}</strong>
              </div>
              {previewMutation.data.outOfScopeCount > 0 && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allowOutOfScope}
                    onChange={(e) => setAllowOutOfScope(e.target.checked)}
                  />
                  <span>Cho phép nhập cả các URL ngoài domain dự án</span>
                </label>
              )}
            </div>
          )}
        </div>
      </CardShell>

      <CardShell title="Lịch sử nhập CSV (Idempotent & Rollback)">
        {summaryQuery.isError ? (
          <QueryError
            error={summaryQuery.error}
            fallback="Không thể tải lịch sử nhập GEO."
          />
        ) : !summary || summary.batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có lượt nhập CSV nào.
          </p>
        ) : (
          <div className="space-y-2">
            {summary.batches.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2.5 text-xs"
              >
                <div>
                  <span className="font-medium">{b.filename}</span> •{" "}
                  <span>{b.source}</span> • {b.recordCount} dòng (
                  {b.validationStatus})
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => rollbackMutation.mutate(b.id)}
                  disabled={rollbackMutation.isPending}
                >
                  Hoàn tác
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardShell>
    </div>
  );
}
