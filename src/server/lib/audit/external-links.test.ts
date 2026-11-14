import { describe, expect, it } from "vitest";
import {
  findBrokenExternalLinks,
  groupExternalTargets,
  MAX_EXTERNAL_TARGETS,
  type ExternalFetch,
} from "@/server/lib/audit/external-links";

const row = (pageId: string, targetUrl: string) => ({
  pageId,
  pageUrl: `https://site.test/${pageId}`,
  targetUrl,
});

describe("groupExternalTargets", () => {
  it("groups sources per target and drops unsafe hosts", () => {
    const targets = groupExternalTargets([
      row("p1", "https://other.test/a"),
      row("p2", "https://other.test/a"),
      row("p1", "http://127.0.0.1/admin"),
      row("p1", "http://localhost:8080/"),
    ]);
    expect(targets).toHaveLength(1);
    expect(targets[0].sources.map((source) => source.pageId)).toEqual([
      "p1",
      "p2",
    ]);
  });

  it("caps the number of distinct targets", () => {
    const rows = Array.from({ length: MAX_EXTERNAL_TARGETS + 20 }, (_, i) =>
      row("p1", `https://other.test/${i}`),
    );
    expect(groupExternalTargets(rows)).toHaveLength(MAX_EXTERNAL_TARGETS);
  });
});

describe("findBrokenExternalLinks", () => {
  function fakeFetch(statuses: Record<string, { head: number; get: number }>) {
    const calls: string[] = [];
    const doFetch: ExternalFetch = async (url, init) => {
      calls.push(`${init.method} ${url}`);
      const entry = statuses[url];
      if (!entry) throw new Error("network down");
      return { status: init.method === "HEAD" ? entry.head : entry.get };
    };
    return { doFetch, calls };
  }

  it("flags a target only when HEAD and GET both say 404/410", async () => {
    const { doFetch, calls } = fakeFetch({
      "https://other.test/gone": { head: 404, get: 404 },
      "https://other.test/head-lies": { head: 404, get: 200 },
      "https://other.test/fine": { head: 200, get: 200 },
      "https://other.test/blocked": { head: 403, get: 403 },
      "https://other.test/removed": { head: 410, get: 410 },
    });
    const broken = await findBrokenExternalLinks(
      [
        row("p1", "https://other.test/gone"),
        row("p2", "https://other.test/gone"),
        row("p1", "https://other.test/head-lies"),
        row("p1", "https://other.test/fine"),
        row("p1", "https://other.test/blocked"),
        row("p1", "https://other.test/removed"),
        row("p1", "https://other.test/unreachable"),
      ],
      { doFetch },
    );
    expect(
      broken.map(
        (item) => `${item.pageId} ${item.targetUrl} ${item.targetStatus}`,
      ),
    ).toEqual([
      "p1 https://other.test/gone 404",
      "p2 https://other.test/gone 404",
      "p1 https://other.test/removed 410",
    ]);
    // Healthy targets cost one HEAD; only suspected ones get a ranged GET.
    expect(calls.filter((call) => call.startsWith("GET"))).toHaveLength(3);
  });

  it("stops probing once the time budget is spent", async () => {
    const { doFetch, calls } = fakeFetch({
      "https://other.test/a": { head: 404, get: 404 },
    });
    let clock = 0;
    const broken = await findBrokenExternalLinks(
      [row("p1", "https://other.test/a")],
      { doFetch, now: () => (clock += 60_000) },
    );
    expect(broken).toEqual([]);
    expect(calls).toEqual([]);
  });
});
