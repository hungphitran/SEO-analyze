import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CardShell } from "@/client/components/CardShell";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { getAuditCrawlDiffFn } from "@/serverFunctions/free-sources-analytics";

const CHANGE_LABELS: Record<string, string> = {
  new_url: "URL mới",
  removed_url: "URL bị gỡ",
  status_changed: "Đổi mã HTTP",
  redirect_changed: "Đổi chuyển hướng",
  canonical_changed: "Đổi Canonical",
  noindex_appeared: "Xuất hiện Noindex",
  title_changed: "Đổi Title",
  description_changed: "Đổi Meta Description",
  internal_links_changed: "Mất liên kết nội bộ",
};

export function CrawlDiffPanel({
  projectId,
  auditId,
}: {
  projectId: string;
  auditId: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const query = useQuery({
    queryKey: ["audit-crawl-diff", projectId, auditId],
    queryFn: () =>
      getAuditCrawlDiffFn({
        data: { projectId, currentAuditId: auditId },
      }),
    enabled: expanded,
  });

  const data = query.data;

  return (
    <CardShell
      title="So sánh Crawl & Phát hiện Orphan URLs"
      action={
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            if (!expanded) setExpanded(true);
            else void query.refetch();
          }}
          disabled={query.isFetching}
        >
          {query.isFetching
            ? "Đang so sánh..."
            : expanded
              ? "Cập nhật so sánh"
              : "So sánh với lần Crawl trước"}
        </Button>
      }
    >
      {!expanded ? (
        <p className="text-xs text-muted-foreground">
          Đối chiếu thay đổi HTTP/noindex/canonical/internal links giữa lần
          crawl này với lần trước và tìm URL mồ côi (từ sitemap & GSC).
        </p>
      ) : query.isPending ? (
        <p className="text-sm text-muted-foreground">Đang phân tích...</p>
      ) : query.isError ? (
        <QueryError
          error={query.error}
          fallback="Không thể so sánh dữ liệu crawl."
        />
      ) : !data?.available ? (
        <p className="text-sm text-muted-foreground">{data?.reason}</p>
      ) : (
        <div className="space-y-4 text-sm">
          {data.diff.incompleteWarning && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-200">
              {data.diff.incompleteWarning}
            </p>
          )}

          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>
              URL đối chiếu cùng phạm vi:{" "}
              <strong className="text-foreground">
                {data.diff.coverageOverlapCount}
              </strong>
            </span>
            <span>•</span>
            <span>
              Thay đổi phát hiện:{" "}
              <strong className="text-foreground">
                {data.diff.changes.length}
              </strong>
            </span>
            <span>•</span>
            <span>
              Orphan candidates:{" "}
              <strong className="text-foreground">
                {data.diff.orphanCandidates.length}
              </strong>
            </span>
          </div>

          {data.diff.changes.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-1.5 pr-3">URL</th>
                    <th className="py-1.5 pr-3">Thay đổi</th>
                    <th className="py-1.5 pr-3">Trước → Sau</th>
                    <th className="py-1.5">Gợi ý xử lý</th>
                  </tr>
                </thead>
                <tbody>
                  {data.diff.changes.slice(0, 50).map((c, idx) => (
                    <tr
                      key={`${c.url}-${c.changeType}-${idx}`}
                      className="border-b align-top"
                    >
                      <td className="py-2 pr-3 break-all max-w-xs">{c.url}</td>
                      <td className="py-2 pr-3 font-medium">
                        {CHANGE_LABELS[c.changeType] ?? c.changeType} (
                        {c.severity})
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {c.previousValue ?? "—"} → {c.currentValue ?? "—"}
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {c.fixSuggestion}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.diff.orphanCandidates.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium">
                Ứng viên Orphan URLs (có trong Sitemap/GSC nhưng 0 inbound links
                trong phạm vi crawl):
              </p>
              <div className="max-h-48 overflow-y-auto rounded border p-2 text-xs space-y-1">
                {data.diff.orphanCandidates.slice(0, 50).map((o) => (
                  <div
                    key={o.url}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="break-all">{o.url}</span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px]">
                      {o.source}
                      {o.coveragePartial ? " • partial" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </CardShell>
  );
}
