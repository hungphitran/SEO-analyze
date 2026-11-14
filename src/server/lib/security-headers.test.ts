import { describe, expect, it } from "vitest";
import {
  isNoindexPath,
  withSecurityHeaders,
} from "@/server/lib/security-headers";

const html = (extra: Record<string, string> = {}) =>
  new Response("<html></html>", {
    headers: { "content-type": "text/html; charset=utf-8", ...extra },
  });

describe("withSecurityHeaders", () => {
  it("adds the full set to an HTML document", () => {
    const res = withSecurityHeaders("/sign-in", html());
    expect(res.headers.get("strict-transport-security")).toBe(
      "max-age=31536000",
    );
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(res.headers.get("permissions-policy")).toContain("camera=()");
    expect(res.headers.get("content-security-policy")).toBe(
      "frame-ancestors 'self'",
    );
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("keeps the body and status", async () => {
    const res = withSecurityHeaders(
      "/x",
      new Response("nope", {
        status: 404,
        headers: { "content-type": "text/html" },
      }),
    );
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("nope");
  });

  it("does not add framing headers to JSON", () => {
    const res = withSecurityHeaders("/api/health", Response.json({ a: 1 }));
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toBeNull();
    expect(res.headers.get("x-frame-options")).toBeNull();
  });

  it("never overrides a route's own policy", () => {
    const own = "default-src 'none'; frame-ancestors 'self'";
    const res = withSecurityHeaders(
      "/p/x/reports/1",
      html({ "content-security-policy": own, "x-robots-tag": "all" }),
    );
    expect(res.headers.get("content-security-policy")).toBe(own);
    expect(res.headers.get("x-frame-options")).toBeNull();
    expect(res.headers.get("x-robots-tag")).toBe("all");
  });

  it("leaves shared report links indexable for unfurlers", () => {
    expect(isNoindexPath("/s/abc123")).toBe(false);
    expect(isNoindexPath("/r/abc")).toBe(false);
    expect(isNoindexPath("/report-map/g/1/2/3")).toBe(false);
    expect(isNoindexPath("/sign-in")).toBe(true);
    expect(isNoindexPath("/settings")).toBe(true);
    const res = withSecurityHeaders("/s/abc", html());
    expect(res.headers.get("x-robots-tag")).toBeNull();
  });
});
