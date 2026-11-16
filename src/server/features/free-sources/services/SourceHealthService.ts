import { Ga4ConnectionRepository } from "@/server/features/ga4/repositories/Ga4ConnectionRepository";
import { getFreeSourcesStatus } from "@/server/features/free-sources/services/FreeSourcesService";
import { getBlockedProviderCallsStats } from "@/server/lib/provider-access";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import type { DataState } from "@/shared/evidence-envelope";
import type {
  FreeSourceSnapshotView,
  FreeSourcesStatus,
  ProjectSourceHealthReport,
  SourceFreshness,
  SourceHealthEntry,
} from "@/shared/free-sources-mode";

const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000;

function computeFreshness(
  fetchedAt: string | null | undefined,
  nowMs: number,
): SourceFreshness {
  if (!fetchedAt) return "unknown";
  const parsed = Date.parse(fetchedAt);
  if (!Number.isFinite(parsed)) return "unknown";
  return nowMs - parsed > STALE_THRESHOLD_MS ? "stale" : "fresh";
}

function mapSnapshotState(
  configured: boolean,
  connected: boolean,
  snapshot: FreeSourceSnapshotView | undefined,
  freshness: SourceFreshness,
): DataState {
  if (!configured || !connected) return "not_configured";
  if (!snapshot) return "insufficient_data";
  if (snapshot.status === "error") return "provider_error";
  if (snapshot.status === "skipped") return "insufficient_data";
  return freshness === "stale" ? "stale" : "ok";
}

function buildGscHealth(
  status: FreeSourcesStatus,
  snap: FreeSourceSnapshotView | undefined,
  nowMs: number,
): SourceHealthEntry {
  const freshness = computeFreshness(snap?.fetchedAt, nowMs);
  const state = mapSnapshotState(
    status.googleSearchConsole.configured,
    status.googleSearchConsole.connected,
    snap,
    freshness,
  );
  let nextSafeAction = "Sẵn sàng.";
  if (!status.googleSearchConsole.configured) {
    nextSafeAction = "Cấu hình GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET trên máy chủ.";
  } else if (!status.googleSearchConsole.connected) {
    nextSafeAction = "Kết nối và chọn property đã xác minh.";
  } else if (state === "stale") {
    nextSafeAction = "Chạy làm mới để cập nhật dữ liệu 28 ngày gần nhất.";
  }
  return {
    source: "gsc",
    label: "Google Search Console",
    configured: status.googleSearchConsole.configured,
    verified: status.googleSearchConsole.connected,
    state,
    lastSuccessAt: snap?.status === "ok" ? snap.fetchedAt : null,
    freshness,
    coverage: status.googleSearchConsole.siteUrl ?? "Chưa chọn property",
    quotaSummary: "Hạn mức miễn phí theo Google Cloud OAuth",
    lastError: snap?.status === "error" ? snap.message : null,
    nextSafeAction,
  };
}

function buildBingHealth(
  status: FreeSourcesStatus,
  snap: FreeSourceSnapshotView | undefined,
  nowMs: number,
): SourceHealthEntry {
  const freshness = computeFreshness(snap?.fetchedAt, nowMs);
  const state = mapSnapshotState(
    status.bing.canStoreKey,
    status.bing.connected,
    snap,
    freshness,
  );
  let nextSafeAction = "Sẵn sàng.";
  if (!status.bing.canStoreKey) {
    nextSafeAction = "Đặt BETTER_AUTH_SECRET (>= 32 ký tự) để mã hóa API key.";
  } else if (!status.bing.connected) {
    nextSafeAction = "Nhập API key và chọn site đã xác minh trong Bing Webmaster.";
  } else if (state === "stale") {
    nextSafeAction = "Làm mới snapshot Bing Webmaster.";
  }
  return {
    source: "bing_webmaster",
    label: "Bing Webmaster",
    configured: status.bing.canStoreKey,
    verified: status.bing.connected,
    state,
    lastSuccessAt: snap?.status === "ok" ? snap.fetchedAt : null,
    freshness,
    coverage: status.bing.siteUrl ?? "Chưa chọn site",
    quotaSummary: "Theo API key của tài khoản Bing Webmaster",
    lastError: snap?.status === "error" ? snap.message : null,
    nextSafeAction,
  };
}

function buildPagespeedHealth(
  status: FreeSourcesStatus,
  snap: FreeSourceSnapshotView | undefined,
  nowMs: number,
): SourceHealthEntry {
  const freshness = computeFreshness(snap?.fetchedAt, nowMs);
  const state = mapSnapshotState(status.pagespeed.configured, true, snap, freshness);
  return {
    source: "pagespeed",
    label: "PageSpeed Insights",
    configured: status.pagespeed.configured,
    verified: status.pagespeed.configured,
    state,
    lastSuccessAt: snap?.status === "ok" ? snap.fetchedAt : null,
    freshness,
    coverage: "Lab Lighthouse (origin/URL khi chạy)",
    quotaSummary: "PAGESPEED_API_KEY (không chạy cron tự động)",
    lastError: snap?.status === "error" ? snap.message : null,
    nextSafeAction: status.pagespeed.configured
      ? "Sẵn sàng cho kiểm tra Lighthouse miễn phí."
      : "Thiết lập PAGESPEED_API_KEY trên máy chủ.",
  };
}

export async function getSourceHealth(input: {
  projectId: string;
}): Promise<ProjectSourceHealthReport> {
  const now = new Date();
  const nowMs = now.getTime();
  const [status, ga4, serpProvider, openSerpEnabled, openSerpUrl, openSerpMax] =
    await Promise.all([
      getFreeSourcesStatus(input),
      Ga4ConnectionRepository.getByProjectId(input.projectId),
      getOptionalEnvValue("SERP_PROVIDER"),
      getOptionalEnvValue("OPENSERP_ENABLED"),
      getOptionalEnvValue("OPENSERP_URL"),
      getOptionalEnvValue("OPENSERP_MAX_KEYWORDS_PER_DAY"),
    ]);

  const snapshotBySource = new Map(
    status.snapshots.map((item) => [item.source, item] as const),
  );

  const openSerpConfigured =
    serpProvider?.trim().toLowerCase() === "openserp" &&
    openSerpEnabled?.trim().toLowerCase() === "true" &&
    Boolean(openSerpUrl?.trim());
  const openSerpDailyQuota = openSerpMax?.trim() || "20";

  const sources: SourceHealthEntry[] = [
    buildGscHealth(status, snapshotBySource.get("gsc"), nowMs),
    buildBingHealth(status, snapshotBySource.get("bing"), nowMs),
    {
      source: "ga4",
      label: "Google Analytics 4",
      configured: status.googleSearchConsole.configured,
      verified: Boolean(ga4),
      state: ga4 ? "ok" : "not_configured",
      lastSuccessAt: ga4?.updatedAt ?? null,
      freshness: ga4 ? "fresh" : "unknown",
      coverage: ga4?.propertyDisplayName ?? "Chưa gắn property GA4",
      quotaSummary: "GA4 Data API miễn phí theo quota property",
      lastError: null,
      nextSafeAction: ga4
        ? "Sẵn sàng đối chiếu organic sessions & key events."
        : "Kết nối GA4 property để đối chiếu chuyển đổi theo trang.",
    },
    buildPagespeedHealth(status, snapshotBySource.get("pagespeed"), nowMs),
    {
      source: "crux",
      label: "Chrome UX Report (CrUX)",
      configured: status.crux.configured,
      verified: status.crux.configured,
      state: status.crux.configured ? "ok" : "not_configured",
      lastSuccessAt: null,
      freshness: "unknown",
      coverage: "Dữ liệu thực p75 (tối đa 40 tuần lịch sử, cache R2 12h)",
      quotaSummary: "150 requests/phút miễn phí",
      lastError: null,
      nextSafeAction: status.crux.configured
        ? "Sẵn sàng (404 nghĩa là site chưa đủ lưu lượng Chrome thực)."
        : "Đặt CRUX_API_KEY hoặc bật CrUX trên PAGESPEED_API_KEY.",
    },
    {
      source: "openserp",
      label: "OpenSERP (Self-hosted SERP)",
      configured: openSerpConfigured,
      verified: openSerpConfigured,
      state: openSerpConfigured ? "ok" : "not_configured",
      lastSuccessAt: null,
      freshness: "unknown",
      coverage: "Top-N SERP quan sát được (region hint, không theo thành phố)",
      quotaSummary: `${openSerpDailyQuota} uncached requests/dự án/ngày UTC`,
      lastError: null,
      nextSafeAction: openSerpConfigured
        ? "Sẵn sàng theo dõi thứ hạng trong hạn mức ngày."
        : "Cấu hình SERP_PROVIDER=openserp, OPENSERP_ENABLED=true và OPENSERP_URL nội bộ.",
    },
    {
      source: "open_pagerank",
      label: "Open PageRank",
      configured: status.openPageRank.configured,
      verified: status.openPageRank.configured,
      state: status.openPageRank.configured ? "ok" : "not_configured",
      lastSuccessAt: null,
      freshness: "unknown",
      coverage: "Domain authority 0–10 (tùy chọn, cache 24h)",
      quotaSummary: "30.000 domains/tháng, 60 RPM (ràng buộc IPv4 với key free)",
      lastError: null,
      nextSafeAction: status.openPageRank.configured
        ? "Sẵn sàng (có thể gặp 403 trên Workers nếu key khóa IP)."
        : "Tùy chọn: đặt OPEN_PAGERANK_API_KEY nếu chạy từ IP cố định.",
    },
  ];

  const blockedStats = getBlockedProviderCallsStats();

  return {
    projectId: input.projectId,
    checkedAt: now.toISOString(),
    freeSourcesOnly: status.freeSourcesOnly,
    blockedProviderCallsTotal: blockedStats.blocked_provider_calls_total,
    sources,
  };
}
