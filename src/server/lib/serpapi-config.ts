import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { SerpApiError } from "@/server/lib/serpapi-errors";

export const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_DAILY = 8;
const DEFAULT_MONTHLY = 250;
const DEFAULT_HOURLY = 50;

const MAX_KEYWORD_LENGTH = 300;
const REGION_PATTERN = /^[A-Za-z]{2}$/;
const LANG_PATTERN = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,4})?$/;

/**
 * Normalize a keyword for SerpApi: Unicode NFC (Vietnamese diacritics stay
 * intact), control characters dropped, whitespace collapsed. Empty or
 * over-long keywords are rejected before any quota is spent.
 */
export function normalizeSerpKeyword(raw: string): string {
  const keyword = raw
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex -- strip C0/C1 control characters
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!keyword) {
    throw new SerpApiError("invalid_input", "Keyword is empty.");
  }
  if (keyword.length > MAX_KEYWORD_LENGTH) {
    throw new SerpApiError(
      "invalid_input",
      `Keyword is longer than ${MAX_KEYWORD_LENGTH} characters.`,
    );
  }
  return keyword;
}

export function assertMarket(region: string, lang: string) {
  if (!REGION_PATTERN.test(region)) {
    throw new SerpApiError(
      "unsupported_targeting",
      "Invalid country code for SerpApi.",
    );
  }
  if (!LANG_PATTERN.test(lang)) {
    throw new SerpApiError(
      "unsupported_targeting",
      "Invalid language code for SerpApi.",
    );
  }
}

export async function readInt(
  name: string,
  fallback: number,
  min: number,
  max: number,
): Promise<number> {
  const raw = (await getOptionalEnvValue(name))?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new SerpApiError(
      "configuration_error",
      `${name} must be an integer from ${min} to ${max}.`,
    );
  }
  return value;
}

export async function getSerpApiDailyRequestLimit(): Promise<number> {
  return readInt("SERPAPI_MAX_KEYWORDS_PER_DAY", DEFAULT_DAILY, 1, 250);
}

export async function getSerpApiLimits() {
  const [daily, monthly, hourly] = await Promise.all([
    getSerpApiDailyRequestLimit(),
    readInt("SERPAPI_MAX_SEARCHES_PER_MONTH", DEFAULT_MONTHLY, 1, 1_000_000),
    readInt("SERPAPI_MAX_SEARCHES_PER_HOUR", DEFAULT_HOURLY, 1, 100_000),
  ]);
  return { daily, monthly, hourly };
}

export async function getApiKey(): Promise<string> {
  const key = (await getOptionalEnvValue("SERPAPI_API_KEY"))?.trim();
  if (!key) {
    throw new SerpApiError(
      "configuration_error",
      "SerpApi is not configured. Set SERPAPI_API_KEY.",
    );
  }
  return key;
}

export async function assertSerpApiReady(input: {
  locationName?: string | null;
}): Promise<void> {
  if (input.locationName) {
    throw new SerpApiError(
      "unsupported_targeting",
      "SerpApi rank tracking supports a country/language market, not city-level targeting.",
    );
  }
  await getApiKey();
}
