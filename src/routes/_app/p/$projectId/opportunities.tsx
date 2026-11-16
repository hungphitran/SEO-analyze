import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { CardShell } from "@/client/components/CardShell";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  listKeywordClustersFn,
  listKeywordOpportunitiesFn,
  refreshKeywordOpportunitiesFn,
  syncOwnedSiteFactsFn,
  updateOpportunityActionFn,
} from "@/serverFunctions/free-sources-analytics";

export const Route = createFileRoute("/_app/p/$projectId/opportunities")({
  component: KeywordOpportunitiesRoute,
});

const RULE_LABELS: Record<string, string> = {
  ctr_opportunity: "Cơ hội CTR",
  near_top: "Sắp lên top (4–20)",
  decaying: "Đang suy giảm",
  growing: "Đang tăng trưởng",
  cannibalization: "Ứng viên cannibalization",
  content_gap: "Khoảng trống nội dung",
};

const STATUS_LABELS: Record<string, string> = {
  new: "Mới",
  in_progress: "Đang xử lý",
  resolved: "Đã xử lý",
  ignored: "Bỏ qua",
};

type RuleValue =
  | "ctr_opportunity"
  | "near_top"
  | "decaying"
  | "growing"
  | "cannibalization"
  | "content_gap";
type StatusValue = "new" | "in_progress" | "resolved" | "ignored";

function parseRule(val: string): RuleValue | undefined {
  if (
    val === "ctr_opportunity" ||
    val === "near_top" ||
    val === "decaying" ||
    val === "growing" ||
    val === "cannibalization" ||
    val === "content_gap"
  ) {
    return val;
  }
  return undefined;
}

function parseStatus(val: string): StatusValue | undefined {
  if (
    val === "new" ||
    val === "in_progress" ||
    val === "resolved" ||
    val === "ignored"
  ) {
    return val;
  }
  return undefined;
}

function KeywordOpportunitiesRoute() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const [ruleFilter, setRuleFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"opportunities" | "clusters">(
    "opportunities",
  );

  const oppQuery = useQuery({
    queryKey: ["keyword-opportunities", projectId, ruleFilter, statusFilter],
    queryFn: () => {
      const rule = parseRule(ruleFilter);
      const status = parseStatus(statusFilter);
      return listKeywordOpportunitiesFn({
        data: {
          projectId,
          ...(rule ? { rule } : {}),
          ...(status ? { status } : {}),
          limit: 100,
        },
      });
    },
  });

  const clustersQuery = useQuery({
    queryKey: ["keyword-clusters", projectId],
    queryFn: () => listKeywordClustersFn({ data: { projectId } }),
  });

  const syncGscMutation = useMutation({
    mutationFn: () =>
      syncOwnedSiteFactsFn({ data: { projectId, source: "gsc" } }),
    onSuccess: (res) => {
      toast.success(`Đã đồng bộ ${res?.rowCount ?? 0} dòng dữ liệu GSC.`);
    },
    onError: (err) => toast.error(getStandardErrorMessage(err)),
  });

  const refreshOppMutation = useMutation({
    mutationFn: () => refreshKeywordOpportunitiesFn({ data: { projectId } }),
    onSuccess: async (res) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["keyword-opportunities", projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["keyword-clusters", projectId],
        }),
      ]);
      toast.success(
        `Đã phát hiện ${res.opportunitiesCount} cơ hội và ${res.clustersCount} cụm từ khóa.`,
      );
    },
    onError: (err) => toast.error(getStandardErrorMessage(err)),
  });

  const updateActionMutation = useMutation({
    mutationFn: (input: {
      opportunityId: string;
      status: "new" | "in_progress" | "resolved" | "ignored";
    }) =>
      updateOpportunityActionFn({
        data: {
          projectId,
          opportunityId: input.opportunityId,
          status: input.status,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["keyword-opportunities", projectId],
      });
      toast.success("Đã cập nhật trạng thái backlog.");
    },
    onError: (err) => toast.error(getStandardErrorMessage(err)),
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            Cơ hội từ khóa (Dữ liệu sở hữu)
          </h1>
          <p className="text-sm text-muted-foreground">
            Phát hiện cơ hội từ dữ liệu GSC thực của website. Không tạo search
            volume, KD hay CPC giả.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => syncGscMutation.mutate()}
            disabled={syncGscMutation.isPending}
          >
            {syncGscMutation.isPending ? "Đang đồng bộ GSC..." : "Đồng bộ GSC"}
          </Button>
          <Button
            type="button"
            onClick={() => refreshOppMutation.mutate()}
            disabled={refreshOppMutation.isPending}
          >
            {refreshOppMutation.isPending
              ? "Đang phân tích..."
              : "Phân tích cơ hội"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b pb-2">
        <Button
          type="button"
          variant={activeTab === "opportunities" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("opportunities")}
        >
          Danh sách cơ hội ({oppQuery.data?.length ?? 0})
        </Button>
        <Button
          type="button"
          variant={activeTab === "clusters" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("clusters")}
        >
          Nhóm từ khóa & Ý định ({clustersQuery.data?.length ?? 0})
        </Button>
      </div>

      {activeTab === "opportunities" ? (
        <CardShell
          title="Action Backlog & Chấm điểm minh bạch (v1.0)"
          action={
            <div className="flex flex-wrap gap-2">
              <select
                className="rounded-md border bg-background px-2 py-1 text-xs"
                value={ruleFilter}
                onChange={(e) => setRuleFilter(e.target.value)}
                aria-label="Lọc theo loại cơ hội"
              >
                <option value="">Tất cả quy tắc</option>
                {Object.entries(RULE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                className="rounded-md border bg-background px-2 py-1 text-xs"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Lọc theo trạng thái"
              >
                <option value="">Tất cả trạng thái</option>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          {oppQuery.isError ? (
            <QueryError
              error={oppQuery.error}
              fallback="Không thể tải danh sách cơ hội từ khóa."
            />
          ) : !oppQuery.data ? (
            <p className="text-sm text-muted-foreground">Đang tải...</p>
          ) : oppQuery.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Chưa có cơ hội nào. Hãy đồng bộ GSC và nhấn &ldquo;Phân tích cơ
              hội&rdquo;.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-2 pr-3">Truy vấn</th>
                    <th className="py-2 pr-3">Loại</th>
                    <th className="py-2 pr-3">Điểm</th>
                    <th className="py-2 pr-3">Lý do & Bằng chứng</th>
                    <th className="py-2">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {oppQuery.data.map((row) => (
                    <tr key={row.id} className="border-b align-top">
                      <td className="py-2.5 pr-3 font-medium">
                        <div>{row.query}</div>
                        {row.targetUrl && (
                          <div className="text-xs text-muted-foreground break-all">
                            {row.targetUrl}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-xs">
                        {RULE_LABELS[row.rule] ?? row.rule}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs">
                        {row.score !== null ? row.score.toFixed(1) : "—"}
                        {row.partialScore ? " (partial)" : ""}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground max-w-md">
                        {row.whySuggested}
                      </td>
                      <td className="py-2.5">
                        <select
                          className="rounded-md border bg-background px-2 py-1 text-xs"
                          value={row.status}
                          aria-label={`Trạng thái cho ${row.query}`}
                          onChange={(e) => {
                            const nextStatus = parseStatus(e.target.value);
                            if (nextStatus) {
                              updateActionMutation.mutate({
                                opportunityId: row.id,
                                status: nextStatus,
                              });
                            }
                          }}
                        >
                          {Object.entries(STATUS_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardShell>
      ) : (
        <CardShell title="Nhóm từ khóa theo quy tắc (Không dùng AI trả phí)">
          {clustersQuery.isError ? (
            <QueryError
              error={clustersQuery.error}
              fallback="Không thể tải nhóm từ khóa."
            />
          ) : !clustersQuery.data || clustersQuery.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Chưa có cụm từ khóa nào. Nhấn &ldquo;Phân tích cơ hội&rdquo; để
              tạo cụm từ dữ liệu GSC.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {clustersQuery.data.map((cluster) => (
                <div
                  key={cluster.id}
                  className="rounded-lg border p-3 text-sm space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{cluster.name}</span>
                    <span className="rounded bg-muted px-2 py-0.5 text-xs">
                      {cluster.intent} • {cluster.evidenceCount} từ khóa
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {cluster.members.slice(0, 8).map((m) => (
                      <span
                        key={m.query}
                        className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground"
                      >
                        {m.query}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardShell>
      )}
    </div>
  );
}
