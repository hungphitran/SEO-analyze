import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";
import type {
  ComparePeriod,
  RankTrackingDetailSearch,
} from "@/types/schemas/rank-tracking-search";

function deviceVisibility(
  devices: RankTrackingConfig["devices"],
  activeDevice: "desktop" | "mobile",
): { showDesktop: boolean; showMobile: boolean } {
  if (devices === "both") {
    return {
      showDesktop: activeDevice === "desktop",
      showMobile: activeDevice === "mobile",
    };
  }
  return {
    showDesktop: devices !== "mobile",
    showMobile: devices !== "desktop",
  };
}

export function resolveActiveDevice(
  isDeviceIndependent: boolean,
  devices: RankTrackingConfig["devices"],
  searchDevice: "desktop" | "mobile" | undefined,
): "desktop" | "mobile" {
  if (isDeviceIndependent) return "desktop";
  if (devices === "both") return searchDevice ?? "desktop";
  return devices;
}

export function getRankTrackingViewState(input: {
  devices: RankTrackingConfig["devices"];
  activeDevice: "desktop" | "mobile";
  isDeviceIndependent: boolean;
  historyAvailable: boolean;
  viewMode: "table" | "history";
  sort: RankTrackingDetailSearch["sort"];
}) {
  const { showDesktop, showMobile } = input.isDeviceIndependent
    ? { showDesktop: true, showMobile: false }
    : deviceVisibility(input.devices, input.activeDevice);
  const defaultSortId = showDesktop ? "desktopPosition" : "mobilePosition";
  const sortId =
    (input.sort === "desktopPosition" && !showDesktop) ||
    (input.sort === "mobilePosition" && !showMobile)
      ? undefined
      : input.sort;
  return {
    showDesktop,
    showMobile,
    defaultSortId,
    sortId,
    effectiveViewMode: input.historyAvailable ? input.viewMode : "table",
  };
}

export function defaultComparePeriod(
  interval: RankTrackingConfig["scheduleInterval"],
): ComparePeriod {
  if (interval === "daily") return "1d";
  if (interval === "monthly") return "30d";
  return "7d";
}
