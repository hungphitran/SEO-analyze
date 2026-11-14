import { describe, expect, it } from "vitest";
import { t } from "@/shared/i18n";
import { localizeFreeSourceMessage } from "./freeSourceMessages";

describe("localizeFreeSourceMessage", () => {
  it("localizes known Search Console templates", () => {
    expect(
      localizeFreeSourceMessage(
        "Search Console returned 12 queries for the last 28 days.",
      ),
    ).toBe(t("freeSources.gscReturnedQueries", { count: "12" }));
    expect(
      localizeFreeSourceMessage(
        "Connect Google Search Console for this project to load query data for a verified property.",
      ),
    ).toBe(t("freeSources.connectGscForQueries"));
    expect(
      localizeFreeSourceMessage(
        "Search Console could not be refreshed. Token expired",
      ),
    ).toBe(t("freeSources.gscRefreshFailed", { error: "Token expired" }));
  });

  it("localizes known PageSpeed and Bing templates", () => {
    expect(
      localizeFreeSourceMessage(
        "This project has no website domain yet, so PageSpeed Insights was not called. Set the project website first.",
      ),
    ).toBe(t("freeSources.pagespeedNoDomain"));
    expect(
      localizeFreeSourceMessage(
        "PageSpeed Insights is not configured. Set PAGESPEED_API_KEY on the server, then refresh again.",
      ),
    ).toBe(t("freeSources.pagespeedNotConfigured"));
    expect(
      localizeFreeSourceMessage(
        "PageSpeed Insights (mobile) scored performance 87 for https://example.com/.",
      ),
    ).toBe(
      t("freeSources.pagespeedScored", {
        score: "87",
        url: "https://example.com/",
      }),
    );
    expect(
      localizeFreeSourceMessage(
        "PageSpeed Insights (mobile) scored performance n/a for https://example.com/.",
      ),
    ).toBe(
      t("freeSources.pagespeedScored", {
        score: t("freeSources.scoreNA"),
        url: "https://example.com/",
      }),
    );
    expect(
      localizeFreeSourceMessage(
        "Connect Bing Webmaster for a verified site to load query stats.",
      ),
    ).toBe(t("freeSources.connectBingForQueries"));
    expect(
      localizeFreeSourceMessage(
        "The stored Bing Webmaster key could not be decrypted. Disconnect and save the key again after checking BETTER_AUTH_SECRET.",
      ),
    ).toBe(t("freeSources.bingDecryptFailed"));
    expect(
      localizeFreeSourceMessage(
        "Bing Webmaster returned 4 queries for https://example.com/.",
      ),
    ).toBe(
      t("freeSources.bingReturnedQueries", {
        count: "4",
        siteUrl: "https://example.com/",
      }),
    );
  });

  it("leaves unknown or raw provider errors unchanged", () => {
    expect(localizeFreeSourceMessage("Quota exceeded for this project")).toBe(
      "Quota exceeded for this project",
    );
    expect(localizeFreeSourceMessage("")).toBe("");
    expect(localizeFreeSourceMessage(null)).toBe("");
  });
});
