import { describe, expect, it } from "vitest";
import { pageHead, pageTitle } from "@/shared/page-title";

describe("pageTitle", () => {
  it("puts the page first and the app name last", () => {
    expect(pageTitle("Tổng quan")).toBe("Tổng quan · OpenSEO");
  });

  it("builds a router head with one title meta from a catalog key", () => {
    expect(pageHead("nav.dashboard")()).toEqual({
      meta: [{ title: "Tổng quan · OpenSEO" }],
    });
  });
});
