export type CrawlPageSnapshot = {
  url: string;
  statusCode: number | null;
  redirectUrl: string | null;
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  isIndexable: boolean;
  inlinkCount: number | null;
  inSitemap: boolean;
};

export type CrawlDiffChangeType =
  | "new_url"
  | "removed_url"
  | "status_changed"
  | "redirect_changed"
  | "canonical_changed"
  | "noindex_appeared"
  | "title_changed"
  | "description_changed"
  | "internal_links_changed";

export type CrawlDiffItem = {
  url: string;
  changeType: CrawlDiffChangeType;
  severity: "critical" | "warning" | "info";
  previousValue: string | null;
  currentValue: string | null;
  fixSuggestion: string;
};

export type OrphanCandidate = {
  url: string;
  source: "sitemap" | "gsc";
  inlinkCount: number;
  coveragePartial: boolean;
};

export type CrawlDiffResult = {
  coverageOverlapCount: number;
  previousComplete: boolean;
  currentComplete: boolean;
  incompleteWarning: string | null;
  changes: CrawlDiffItem[];
  orphanCandidates: OrphanCandidate[];
};

export function diffCrawlSnapshots(input: {
  previousPages: CrawlPageSnapshot[];
  currentPages: CrawlPageSnapshot[];
  previousComplete: boolean;
  currentComplete: boolean;
  gscKnownUrls?: string[];
}): CrawlDiffResult {
  const prevMap = new Map(input.previousPages.map((p) => [p.url, p] as const));
  const currMap = new Map(input.currentPages.map((p) => [p.url, p] as const));

  const changes: CrawlDiffItem[] = [];
  let coverageOverlapCount = 0;

  for (const [url, curr] of currMap.entries()) {
    const prev = prevMap.get(url);
    if (!prev) {
      if (input.previousComplete) {
        changes.push({
          url,
          changeType: "new_url",
          severity: "info",
          previousValue: null,
          currentValue: String(curr.statusCode ?? "unknown"),
          fixSuggestion: "Kiểm tra URL mới phát hiện có nằm trong sitemap và được index đúng ý định.",
        });
      }
      continue;
    }

    coverageOverlapCount += 1;

    if (prev.statusCode !== curr.statusCode) {
      const is5xxOr4xx = (curr.statusCode ?? 0) >= 400;
      changes.push({
        url,
        changeType: "status_changed",
        severity: is5xxOr4xx ? "critical" : "warning",
        previousValue: prev.statusCode !== null ? String(prev.statusCode) : null,
        currentValue: curr.statusCode !== null ? String(curr.statusCode) : null,
        fixSuggestion: is5xxOr4xx
          ? "Khôi phục trang hoặc thiết lập chuyển hướng 301 hợp lệ và cập nhật internal links."
          : "Xác nhận mã trạng thái HTTP mới có đúng chủ đích.",
      });
    }

    if (prev.isIndexable && !curr.isIndexable) {
      changes.push({
        url,
        changeType: "noindex_appeared",
        severity: "critical",
        previousValue: "indexable",
        currentValue: "noindex",
        fixSuggestion: "Kiểm tra thẻ meta robots hoặc X-Robots-Tag; gỡ noindex nếu trang cần xuất hiện trên tìm kiếm.",
      });
    }

    if (prev.canonicalUrl !== curr.canonicalUrl) {
      changes.push({
        url,
        changeType: "canonical_changed",
        severity: "warning",
        previousValue: prev.canonicalUrl,
        currentValue: curr.canonicalUrl,
        fixSuggestion: "Xác minh thẻ canonical trỏ về đúng URL chuẩn, tránh trỏ nhầm domain hoặc trang khác.",
      });
    }

    if (prev.redirectUrl !== curr.redirectUrl) {
      changes.push({
        url,
        changeType: "redirect_changed",
        severity: "warning",
        previousValue: prev.redirectUrl,
        currentValue: curr.redirectUrl,
        fixSuggestion: "Cập nhật liên kết nội bộ trỏ thẳng tới URL đích để tránh chuỗi redirect.",
      });
    }

    if (prev.title !== curr.title) {
      changes.push({
        url,
        changeType: "title_changed",
        severity: "info",
        previousValue: prev.title,
        currentValue: curr.title,
        fixSuggestion: "Đối chiếu tác động CTR sau khi thay đổi thẻ title.",
      });
    }

    if (prev.metaDescription !== curr.metaDescription) {
      changes.push({
        url,
        changeType: "description_changed",
        severity: "info",
        previousValue: prev.metaDescription,
        currentValue: curr.metaDescription,
        fixSuggestion: "Đảm bảo meta description mô tả chính xác nội dung trang.",
      });
    }

    if (
      prev.inlinkCount !== null &&
      curr.inlinkCount !== null &&
      prev.inlinkCount > 0 &&
      curr.inlinkCount === 0
    ) {
      changes.push({
        url,
        changeType: "internal_links_changed",
        severity: "warning",
        previousValue: String(prev.inlinkCount),
        currentValue: "0",
        fixSuggestion: "Trang mất toàn bộ liên kết nội bộ trong phạm vi crawl; bổ sung internal link từ các trang liên quan.",
      });
    }
  }

  // Only report removed URLs when BOTH crawls completed cleanly.
  if (input.previousComplete && input.currentComplete) {
    for (const [url, prev] of prevMap.entries()) {
      if (!currMap.has(url)) {
        changes.push({
          url,
          changeType: "removed_url",
          severity: "warning",
          previousValue: prev.statusCode !== null ? String(prev.statusCode) : "present",
          currentValue: null,
          fixSuggestion: "Nếu trang đã xóa, đảm bảo trả về 410/404 hoặc 301 phù hợp và gỡ khỏi sitemap.",
        });
      }
    }
  }

  const orphanCandidates: OrphanCandidate[] = [];
  const seenOrphans = new Set<string>();
  const coveragePartial = !input.currentComplete;

  for (const page of input.currentPages) {
    if (page.inSitemap && (page.inlinkCount ?? 0) === 0) {
      seenOrphans.add(page.url);
      orphanCandidates.push({
        url: page.url,
        source: "sitemap",
        inlinkCount: 0,
        coveragePartial,
      });
    }
  }

  for (const gscUrl of input.gscKnownUrls ?? []) {
    if (seenOrphans.has(gscUrl)) continue;
    const crawled = currMap.get(gscUrl);
    if (!crawled || (crawled.inlinkCount ?? 0) === 0) {
      seenOrphans.add(gscUrl);
      orphanCandidates.push({
        url: gscUrl,
        source: "gsc",
        inlinkCount: crawled?.inlinkCount ?? 0,
        coveragePartial,
      });
    }
  }

  const incompleteWarning =
    !input.previousComplete || !input.currentComplete
      ? "Một trong hai lần crawl chưa hoàn tất; chỉ so sánh trên các URL cùng xuất hiện (coverage overlap) và không báo URL bị xóa giả."
      : null;

  return {
    coverageOverlapCount,
    previousComplete: input.previousComplete,
    currentComplete: input.currentComplete,
    incompleteWarning,
    changes,
    orphanCandidates,
  };
}
