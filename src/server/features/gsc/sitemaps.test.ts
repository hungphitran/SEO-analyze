import { describe, expect, it } from "vitest";
import { toSitemapRows } from "./sitemaps";

describe("toSitemapRows", () => {
  it("parses int64 strings and derives a status", () => {
    const rows = toSitemapRows([
      {
        path: "https://a.com/ok.xml",
        lastSubmitted: "2026-11-01T00:00:00Z",
        lastDownloaded: "2026-11-10T00:00:00Z",
        errors: "0",
        warnings: "0",
        contents: [{ type: "web", submitted: "120", indexed: "0" }],
      },
      { path: "https://a.com/pending.xml", isPending: true },
      { path: "https://a.com/warn.xml", warnings: "3" },
      { path: "https://a.com/bad.xml", errors: "2", warnings: "1" },
    ]);
    expect(rows.map((row) => [row.path, row.status])).toEqual([
      ["https://a.com/bad.xml", "errors"],
      ["https://a.com/warn.xml", "warnings"],
      ["https://a.com/pending.xml", "pending"],
      ["https://a.com/ok.xml", "ok"],
    ]);
    const ok = rows.find((row) => row.status === "ok");
    expect(ok?.contents).toEqual([{ type: "web", submitted: 120 }]);
    expect(ok?.lastDownloaded).toBe("2026-11-10T00:00:00Z");
  });

  it("skips entries without a path and returns [] for none", () => {
    expect(toSitemapRows([{}, { path: "" }])).toEqual([]);
    expect(toSitemapRows([])).toEqual([]);
  });

  it("ignores junk counts", () => {
    const [row] = toSitemapRows([
      { path: "https://a.com/s.xml", errors: "abc", warnings: "-4" },
    ]);
    expect(row).toMatchObject({ errors: 0, warnings: 0, status: "ok" });
  });
});
