import { describe, expect, it } from "vitest";
import { AUDIT_ISSUE_TYPES } from "@/shared/audit-issues";
import { getAuditIssueCopy, getAuditIssueTitle } from "./issueLabels";

describe("getAuditIssueCopy", () => {
  it("covers every registry issue type with Vietnamese titles", () => {
    const ids = Object.keys(AUDIT_ISSUE_TYPES);
    expect(ids.length).toBe(42);
    for (const id of ids) {
      const copy = getAuditIssueCopy(id);
      expect(copy.title, id).toMatch(
        /[A-Za-zĂÂĐÊÔƠƯáàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ]/,
      );
      // Schema identifiers stay English in the registry and as the lookup key.
      const registry: Record<string, { title: string }> = AUDIT_ISSUE_TYPES;
      expect(registry[id]?.title).not.toBe(copy.title);
      expect(copy.explanation.length).toBeGreaterThan(20);
      expect(copy.howToFix.length).toBeGreaterThan(10);
    }
  });

  it("falls back to the raw type id for unknown types", () => {
    expect(getAuditIssueTitle("not-a-real-issue")).toBe("not-a-real-issue");
    const copy = getAuditIssueCopy("not-a-real-issue");
    expect(copy.title).toBe("not-a-real-issue");
    expect(copy.explanation).toBe("");
    expect(copy.howToFix).toBe("");
  });

  it("does not rewrite registry English titles used by MCP", () => {
    expect(AUDIT_ISSUE_TYPES["noindex-page"].title).toBe("Page is noindex");
    expect(getAuditIssueTitle("noindex-page")).toBe("Trang đang noindex");
  });
});
