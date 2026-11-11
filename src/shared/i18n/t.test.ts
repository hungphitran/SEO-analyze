import { describe, expect, it } from "vitest";
import { t } from "./t";
import { messages } from "./messages";

describe("t", () => {
  it("returns Vietnamese copy for a known key", () => {
    expect(t("nav.dashboard")).toBe("Tổng quan");
    expect(t("auth.signIn")).toBe("Đăng nhập");
  });

  it("substitutes named placeholders", () => {
    expect(t("auth.passwordMin", { min: 8 })).toBe(
      "Mật khẩu phải có ít nhất 8 ký tự.",
    );
    expect(t("integrations.wasCanceled", { what: "Google Search Console" })).toBe(
      "Google Search Console đã bị hủy",
    );
  });

  it("keeps unknown placeholders intact", () => {
    expect(t("auth.passwordMin", {})).toBe(
      "Mật khẩu phải có ít nhất {min} ký tự.",
    );
  });

  it("keeps product names in Vietnamese sentences", () => {
    expect(t("errors.FREE_SOURCES_ONLY")).toContain("DataForSEO");
    expect(t("errors.FREE_SOURCES_ONLY")).toContain("Google Search Console");
    expect(t("errors.FREE_SOURCES_ONLY")).toContain("PageSpeed Insights");
    expect(t("errors.FREE_SOURCES_ONLY")).toContain("Bing Webmaster");
    expect(t("dashboard.gscPerformance")).toContain("Google Search Console");
  });

  it("covers every catalog value as a non-empty string", () => {
    for (const [key, value] of Object.entries(messages)) {
      expect(value, key).toEqual(expect.any(String));
      expect(value.trim().length, key).toBeGreaterThan(0);
    }
  });
});
