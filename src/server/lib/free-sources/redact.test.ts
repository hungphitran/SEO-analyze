import { describe, expect, it } from "vitest";
import { redactApiKeyQuery, redactSecret, safeErrorMessage } from "./redact";

describe("secret redaction", () => {
  it("strips the secret and apikey query values", () => {
    expect(redactSecret("token=abc123 failed", "abc123")).toBe(
      "token=[redacted] failed",
    );
    expect(
      redactApiKeyQuery(
        "https://ssl.bing.com/webmaster/api.svc/json/GetUserSites?apikey=abc123",
      ),
    ).toBe(
      "https://ssl.bing.com/webmaster/api.svc/json/GetUserSites?apikey=[redacted]",
    );
    expect(
      safeErrorMessage(new Error("apikey=abc123 boom abc123"), "abc123"),
    ).toBe("apikey=[redacted] boom [redacted]");
  });
});
