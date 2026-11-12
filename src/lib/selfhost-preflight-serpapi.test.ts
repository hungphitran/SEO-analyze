import { describe, expect, it } from "vitest";
import { runSelfhostPreflight } from "./selfhost-preflight";

const base = { AUTH_MODE: "local_noauth", FREE_SOURCES_ONLY: "true" };

function serpapi(env: Record<string, string>) {
  const result = runSelfhostPreflight({ ...base, ...env });
  return {
    result,
    item: result.items.find((i) => i.name === "SerpApi"),
  };
}

describe("preflight SerpApi item", () => {
  it("is ok when selected with a key, and never prints the key", () => {
    const { item } = serpapi({
      SERP_PROVIDER: "serpapi",
      SERPAPI_API_KEY: "super-secret-serp-key",
    });
    expect(item?.level).toBe("ok");
    expect(JSON.stringify(item)).not.toContain("super-secret-serp-key");
  });

  it("warns (does not fail the deploy) when selected without a key", () => {
    const { item, result } = serpapi({ SERP_PROVIDER: "serpapi" });
    expect(item?.level).toBe("warn");
    expect(result.failed).toBe(false);
  });

  it("is informational when a key is set but not selected, or nothing is set", () => {
    expect(serpapi({ SERPAPI_API_KEY: "k" }).item?.level).toBe("info");
    expect(serpapi({}).item?.level).toBe("info");
  });
});
