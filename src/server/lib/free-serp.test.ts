import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: vi.fn(),
  getCached: vi.fn(),
  setCached: vi.fn(),
}));
vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({ RankTrackingRepository: {} }),
);

import {
  hostnameMatchesTarget,
  isFreeSerpProvider,
  normalizeRankTargetDomain,
  toSerpAppError,
} from "./free-serp";
import { AppError } from "@/server/lib/errors";
import { SerpApiError } from "@/server/lib/serpapi";

describe("normalizeRankTargetDomain", () => {
  it.each([
    ["example.com", "example.com"],
    ["Example.COM", "example.com"],
    ["www.example.com", "example.com"],
    ["https://www.example.com/", "example.com"],
    ["http://example.com/path?q=1#x", "example.com"],
    ["example.com:8080/page", "example.com"],
    ["example.com.", "example.com"],
    ["  blog.example.co.uk  ", "blog.example.co.uk"],
    ["https://shop.example.com.vn/a", "shop.example.com.vn"],
    // IDN is compared as punycode, like the hostnames that come from result URLs.
    ["https://bücher.example/", "xn--bcher-kva.example"],
  ])("normalizes %j", (input, expected) => {
    expect(normalizeRankTargetDomain(input)).toBe(expected);
  });

  it.each(["", "   ", "localhost", "http://", "not a domain", "https://"])(
    "returns null for %j so a bad domain is reported, not matched",
    (input) => {
      expect(normalizeRankTargetDomain(input)).toBeNull();
    },
  );
});

describe("hostnameMatchesTarget", () => {
  it("matches the domain and its subdomains, not look-alikes", () => {
    expect(hostnameMatchesTarget("example.com", "example.com")).toBe(true);
    expect(hostnameMatchesTarget("blog.example.com", "example.com")).toBe(true);
    expect(hostnameMatchesTarget("notexample.com", "example.com")).toBe(false);
    expect(hostnameMatchesTarget("example.com.evil.io", "example.com")).toBe(
      false,
    );
    expect(hostnameMatchesTarget("example.com", "blog.example.com")).toBe(
      false,
    );
  });
});

describe("isFreeSerpProvider", () => {
  it("is true only for openserp and serpapi", () => {
    expect(isFreeSerpProvider("openserp")).toBe(true);
    expect(isFreeSerpProvider("serpapi")).toBe(true);
    expect(isFreeSerpProvider("dataforseo")).toBe(false);
    expect(isFreeSerpProvider(null)).toBe(false);
  });
});

describe("toSerpAppError", () => {
  it.each([
    ["configuration_error", "SERP_NOT_CONFIGURED"],
    ["quota_exceeded", "SERP_QUOTA_EXCEEDED"],
    ["rate_limited", "SERP_QUOTA_EXCEEDED"],
    ["invalid_input", "VALIDATION_ERROR"],
    ["unsupported_targeting", "VALIDATION_ERROR"],
    ["timeout", "SERP_UNAVAILABLE"],
    ["upstream_error", "SERP_UNAVAILABLE"],
    ["invalid_response", "SERP_UNAVAILABLE"],
    ["no_results_unverified", "SERP_UNAVAILABLE"],
    ["captcha", "SERP_UNAVAILABLE"],
    ["blocked", "SERP_UNAVAILABLE"],
  ] as const)("maps %s to a client-facing %s code", (code, appCode) => {
    const mapped = toSerpAppError(new SerpApiError(code, "msg"));
    if (!(mapped instanceof AppError)) throw new Error("expected AppError");
    expect(mapped.code).toBe(appCode);
  });

  it("passes other errors through untouched", () => {
    const other = new Error("x");
    expect(toSerpAppError(other)).toBe(other);
  });
});
