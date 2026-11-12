import { t } from "@/shared/i18n";

/**
 * Client-only display of app-generated free-source snapshot messages.
 * Stored snapshots and server writers stay in English; unknown or
 * provider error text is shown as stored.
 */
export function localizeFreeSourceMessage(
  message: string | null | undefined,
): string {
  if (!message) return "";

  const gscCount = message.match(
    /^Search Console returned (\d+) queries for the last 28 days\.$/,
  );
  if (gscCount) {
    return t("freeSources.gscReturnedQueries", { count: gscCount[1] });
  }

  if (
    message ===
    "Connect Google Search Console for this project to load query data for a verified property."
  ) {
    return t("freeSources.connectGscForQueries");
  }

  const gscRefresh = message.match(
    /^Search Console could not be refreshed\. (.*)$/,
  );
  if (gscRefresh) {
    return t("freeSources.gscRefreshFailed", { error: gscRefresh[1] });
  }

  if (
    message ===
    "This project has no website domain yet, so PageSpeed Insights was not called. Set the project website first."
  ) {
    return t("freeSources.pagespeedNoDomain");
  }

  if (
    message ===
    "PageSpeed Insights is not configured. Set PAGESPEED_API_KEY on the server, then refresh again."
  ) {
    return t("freeSources.pagespeedNotConfigured");
  }

  const psi = message.match(
    /^PageSpeed Insights \(mobile\) scored performance (.+) for (.+)\.$/,
  );
  if (psi) {
    const score = psi[1] === "n/a" ? t("freeSources.scoreNA") : psi[1];
    return t("freeSources.pagespeedScored", { score, url: psi[2] });
  }

  if (
    message ===
    "Connect Bing Webmaster for a verified site to load query stats."
  ) {
    return t("freeSources.connectBingForQueries");
  }

  if (
    message ===
    "The stored Bing Webmaster key could not be decrypted. Disconnect and save the key again after checking BETTER_AUTH_SECRET."
  ) {
    return t("freeSources.bingDecryptFailed");
  }

  const bingKnown: Record<string, Parameters<typeof t>[0]> = {
    "Bing Webmaster rejected the stored API key. Disconnect and save a new key.":
      "freeSources.bingKeyRejectedStored",
    "Bing Webmaster is throttling this key. Try again later.":
      "freeSources.bingThrottled",
    "Bing Webmaster is limiting this server's IP address. Try again later.":
      "freeSources.bingIpThrottled",
    "Bing Webmaster returned an unreadable response.":
      "freeSources.bingUnreadable",
    "Bing Webmaster could not be reached. Try again in a few minutes.":
      "freeSources.bingUnreachable",
  };
  if (Object.hasOwn(bingKnown, message)) return t(bingKnown[message]);

  const bing = message.match(
    /^Bing Webmaster returned (\d+) queries for (.+)\.$/,
  );
  if (bing) {
    return t("freeSources.bingReturnedQueries", {
      count: bing[1],
      siteUrl: bing[2],
    });
  }

  return message;
}
