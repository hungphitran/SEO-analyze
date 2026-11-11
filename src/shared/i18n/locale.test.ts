import { describe, expect, it } from "vitest";
import {
  UI_LANG,
  UI_LOCALE,
  formatUiDate,
  formatUiNumber,
  formatUiPercent,
  formatUiRelativeTime,
} from "./locale";

describe("UI locale", () => {
  it("defaults to Vietnamese", () => {
    expect(UI_LOCALE).toBe("vi-VN");
    expect(UI_LANG).toBe("vi");
  });

  it("formats numbers and percents for vi-VN without changing the numeric value", () => {
    expect(formatUiNumber(11)).toBe("11");
    expect(formatUiNumber(46)).toBe("46");
    expect(formatUiNumber(12345)).toMatch(/12.?345/);
    expect(formatUiPercent(0.239)).toMatch(/23[,.]9\s*%/);
  });

  it("formats a calendar date in vi-VN and leaves invalid input empty", () => {
    const formatted = formatUiDate("2026-11-11T00:00:00.000Z", {
      timeZone: "UTC",
      day: "numeric",
      month: "numeric",
      year: "numeric",
    });
    expect(formatted).toMatch(/11/);
    expect(formatted).toMatch(/2026/);
    expect(formatUiDate("not-a-date")).toBe("");
  });

  it("formats a recent relative time in Vietnamese", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatUiRelativeTime(twoHoursAgo)).toMatch(/giờ|2/);
    expect(formatUiRelativeTime(new Date().toISOString())).toBe("vừa xong");
    expect(formatUiRelativeTime("nope")).toBe("");
  });
});
