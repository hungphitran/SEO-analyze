import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { messages } from "./messages";

const SRC_ROOT = join(__dirname, "..", "..");
const CALL = /\bt\(\s*["']([a-zA-Z0-9_.]+)["']\s*(?:,\s*\{([^}]*)\})?/g;
const PLACEHOLDER = /\{([a-zA-Z0-9_]+)\}/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" ? [] : sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

const calls = sourceFiles(SRC_ROOT).flatMap((file) =>
  [...readFileSync(file, "utf8").matchAll(CALL)].map((match) => ({
    where: relative(SRC_ROOT, file),
    key: match[1],
    vars: match[2],
  })),
);

const catalog: Record<string, string> = messages;

describe("i18n catalog coverage", () => {
  it("finds the t() calls it checks", () => {
    expect(calls.length).toBeGreaterThan(2000);
  });

  it("has a catalog entry for every t() key used in src", () => {
    const missing = calls
      .filter((call) => !Object.hasOwn(catalog, call.key))
      .map((call) => `${call.where}: ${call.key}`);
    expect(missing).toEqual([]);
  });

  it("passes every placeholder an inline t() call's template needs", () => {
    const unfilled: string[] = [];
    for (const call of calls) {
      if (!Object.hasOwn(catalog, call.key)) continue;
      if (call.vars === undefined) {
        if (/\{v\d+\}/.test(catalog[call.key])) unfilled.push(`${call.where}: ${call.key} (no vars)`);
        continue;
      }
      // Only plain `{ a: ..., b }` objects are checkable; skip spreads.
      if (call.vars.includes("...")) continue;
      const passed = new Set(
        call.vars
          .split(",")
          .map((part) => part.split(":")[0]?.trim())
          .filter(Boolean),
      );
      for (const [, name] of catalog[call.key].matchAll(PLACEHOLDER)) {
        if (!passed.has(name)) unfilled.push(`${call.where}: ${call.key} {${name}}`);
      }
    }
    expect(unfilled).toEqual([]);
  });

  it("leaves no untranslated v-placeholders unused by any caller", () => {
    const used = new Set(calls.map((call) => call.key));
    const orphanedVarKeys = Object.keys(catalog).filter(
      (key) => key.startsWith("ui.") && !used.has(key) && /\{v\d+\}/.test(catalog[key]),
    );
    // Generated ui.* keys with {vN} placeholders exist only for a call site.
    expect(orphanedVarKeys).toEqual([]);
  });
});
