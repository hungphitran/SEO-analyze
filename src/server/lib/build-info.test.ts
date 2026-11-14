import { describe, expect, it } from "vitest";
import { getBuildCommit } from "@/server/lib/build-info";

describe("getBuildCommit", () => {
  it("falls back to dev when no build define exists (unit tests, vite dev)", () => {
    expect(getBuildCommit()).toBe("dev");
  });
});
