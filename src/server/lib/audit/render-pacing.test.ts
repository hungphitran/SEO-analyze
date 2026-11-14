import { describe, expect, it } from "vitest";
import {
  nextRenderSlot,
  parseRenderIntervalMs,
  renderRetryDelayMs,
} from "./render-pacing";

describe("parseRenderIntervalMs", () => {
  it.each([
    [undefined, 0],
    ["", 0],
    ["0", 0],
    ["-5", 0],
    ["abc", 0],
    ["10000", 10_000],
    [" 2500 ", 2_500],
    ["999999", 60_000],
  ])("%s -> %s", (raw, expected) => {
    expect(parseRenderIntervalMs(raw)).toBe(expected);
  });
});

describe("renderRetryDelayMs", () => {
  it("honours Retry-After but never goes below one interval", () => {
    expect(renderRetryDelayMs("12", 10_000)).toBe(12_000);
    expect(renderRetryDelayMs("2", 10_000)).toBe(10_000);
    expect(renderRetryDelayMs(null, 10_000)).toBe(10_000);
  });
  it("caps a long Retry-After", () => {
    expect(renderRetryDelayMs("600", 10_000)).toBe(30_000);
  });
});

describe("nextRenderSlot", () => {
  it("gives the first caller an immediate turn and spaces the next", () => {
    expect(nextRenderSlot(0, 1_000_000, 10_000)).toEqual({
      waitMs: 0,
      nextAt: 1_010_000,
    });
  });
  it("queues concurrent callers one interval apart", () => {
    const now = 1_000_000;
    const first = nextRenderSlot(0, now, 10_000);
    const second = nextRenderSlot(first.nextAt, now, 10_000);
    const third = nextRenderSlot(second.nextAt, now, 10_000);
    expect([first.waitMs, second.waitMs, third.waitMs]).toEqual([
      0, 10_000, 20_000,
    ]);
  });
  it("lets an idle clock start immediately again", () => {
    expect(nextRenderSlot(1_000, 50_000, 10_000).waitMs).toBe(0);
  });
});
