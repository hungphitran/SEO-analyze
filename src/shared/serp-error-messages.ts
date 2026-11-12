import { t } from "@/shared/i18n";

/**
 * Vietnamese display text for the stable English messages that the free SERP
 * providers (SerpApi, OpenSERP) and the rank-check workflow store on a run.
 * Stored text stays English; unknown messages return null so the caller shows
 * them as stored. The messages never contain keys, URLs or request bodies.
 */
export function localizeSerpMessage(message: string): string | null {
  const provider = /SerpApi/.test(message)
    ? "SerpApi"
    : /OpenSERP/.test(message)
      ? "OpenSERP"
      : null;
  const name = provider ?? t("serp.msg.providerGeneric");

  const window = message.match(/(daily|hourly|monthly)[ a-z]* limit reached/i);
  if (window) {
    const key = window[1].toLowerCase();
    return t("serp.msg.limitReached", {
      provider: name,
      window:
        key === "daily"
          ? t("serp.msg.windowDay")
          : key === "hourly"
            ? t("serp.msg.windowHour")
            : t("serp.msg.windowMonth"),
    });
  }
  if (/plan search limit reached/i.test(message)) {
    return t("serp.msg.limitReached", {
      provider: name,
      window: t("serp.msg.windowMonth"),
    });
  }
  if (/rate-limited/i.test(message)) {
    return t("serp.msg.rateLimited", { provider: name });
  }
  if (/rejected the API key/i.test(message)) {
    return t("serp.msg.keyRejected", { provider: name });
  }
  if (/is not configured|must be an integer/i.test(message)) {
    return t("serp.msg.notConfigured", { provider: name });
  }
  if (/timed out/i.test(message)) {
    return t("serp.msg.timeout", { provider: name });
  }
  if (/CAPTCHA/i.test(message))
    return t("serp.msg.captcha", { provider: name });
  if (/was blocked/i.test(message)) {
    return t("serp.msg.blocked", { provider: name });
  }
  if (/returned no (organic )?results/i.test(message)) {
    return t("serp.msg.noResults", { provider: name });
  }
  if (
    /unexpected response|invalid JSON|invalid URL|unsupported URL|too large/i.test(
      message,
    )
  ) {
    return t("serp.msg.invalidResponse", { provider: name });
  }
  if (/Keyword is empty|Keyword is longer/i.test(message)) {
    return t("serp.msg.invalidKeyword");
  }
  if (/Tracked domain is invalid/i.test(message)) {
    return t("serp.msg.invalidDomain");
  }
  if (
    /Invalid (country|language) code|city-level|market region hint/i.test(
      message,
    )
  ) {
    return t("serp.msg.unsupportedTargeting", { provider: name });
  }
  if (
    /could not be reached|connection dropped|request failed|could not complete|could not search|rank check failed/i.test(
      message,
    )
  ) {
    return t("serp.msg.unavailable", { provider: name });
  }
  return null;
}
