import { describe, expect, it } from "vitest";
import { projectWebsiteUrlFromDomain } from "./project-url";

describe("projectWebsiteUrlFromDomain", () => {
  it("builds https URLs from a bare host and rejects unsafe values", () => {
    expect(projectWebsiteUrlFromDomain("Example.COM")).toBe(
      "https://example.com",
    );
    expect(projectWebsiteUrlFromDomain(" www.example.com ")).toBe(
      "https://www.example.com",
    );
    expect(projectWebsiteUrlFromDomain(null)).toBeNull();
    expect(projectWebsiteUrlFromDomain("")).toBeNull();
    expect(projectWebsiteUrlFromDomain("https://example.com")).toBeNull();
    expect(projectWebsiteUrlFromDomain("example.com/path")).toBeNull();
    expect(projectWebsiteUrlFromDomain("user:pass@example.com")).toBeNull();
  });
});
