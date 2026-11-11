import { describe, expect, it } from "vitest";
import {
  isFreeSourcesOnlyValue,
  shouldNagForDataforseoSetup,
} from "./free-sources-mode";

describe("isFreeSourcesOnlyValue", () => {
  it("accepts only explicit truthy flags", () => {
    expect(isFreeSourcesOnlyValue("true")).toBe(true);
    expect(isFreeSourcesOnlyValue("TRUE")).toBe(true);
    expect(isFreeSourcesOnlyValue("1")).toBe(true);
    expect(isFreeSourcesOnlyValue("yes")).toBe(true);
    expect(isFreeSourcesOnlyValue("on")).toBe(true);
    expect(isFreeSourcesOnlyValue(" true ")).toBe(true);
  });

  it("rejects unset, empty, and other values", () => {
    expect(isFreeSourcesOnlyValue(undefined)).toBe(false);
    expect(isFreeSourcesOnlyValue(null)).toBe(false);
    expect(isFreeSourcesOnlyValue("")).toBe(false);
    expect(isFreeSourcesOnlyValue("0")).toBe(false);
    expect(isFreeSourcesOnlyValue("false")).toBe(false);
    expect(isFreeSourcesOnlyValue("dataforseo-key")).toBe(false);
  });
});

describe("shouldNagForDataforseoSetup", () => {
  it("hides the DataForSEO setup nag in free-sources-only mode even when the paid key is not usable", () => {
    expect(
      shouldNagForDataforseoSetup({
        freeSourcesOnly: true,
        configured: false,
      }),
    ).toBe(false);
    expect(
      shouldNagForDataforseoSetup({
        freeSourcesOnly: true,
        configured: true,
      }),
    ).toBe(false);
    expect(
      shouldNagForDataforseoSetup({
        freeSourcesOnly: true,
        configured: null,
      }),
    ).toBe(false);
  });

  it("still nags when a paid DataForSEO setup is required and missing", () => {
    expect(
      shouldNagForDataforseoSetup({
        freeSourcesOnly: false,
        configured: false,
      }),
    ).toBe(true);
  });

  it("does not nag while status is loading or the paid key is already configured", () => {
    expect(
      shouldNagForDataforseoSetup({
        freeSourcesOnly: false,
        configured: null,
      }),
    ).toBe(false);
    expect(
      shouldNagForDataforseoSetup({
        freeSourcesOnly: false,
        configured: true,
      }),
    ).toBe(false);
  });
});
