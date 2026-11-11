/**
 * Bing Webmaster Tools JSON/REST API client.
 *
 * Official access: https://learn.microsoft.com/en-us/bingwebmaster/getting-access
 * JSON protocol: https://ssl.bing.com/webmaster/api.svc/json/METHOD_NAME
 * SOAP/POX endpoints are deprecated (retire 31 Aug 2026); this client uses JSON only.
 *
 * Auth is an API key as the official `apikey` query parameter. The key is
 * never logged; error messages have it stripped. Only verified sites are
 * returned or queried — unverified properties are refused.
 */
import {
  redactApiKeyQuery,
  safeErrorMessage,
} from "@/server/lib/free-sources/redact";

export const BING_WEBMASTER_JSON_BASE =
  "https://ssl.bing.com/webmaster/api.svc/json";

export type BingVerifiedSite = {
  url: string;
};

export type BingQueryStat = {
  query: string;
  clicks: number;
  impressions: number;
  avgImpressionPosition: number | null;
  avgClickPosition: number | null;
};

export type BingQuerySummary = {
  siteUrl: string;
  queryCount: number;
  totalClicks: number;
  totalImpressions: number;
  queries: BingQueryStat[];
};

export class BingWebmasterError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "BingWebmasterError";
    this.status = status;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return Object.fromEntries(Object.entries(value));
}

function stringField(
  record: Record<string, unknown> | null,
  name: string,
): string | null {
  const value = record?.[name];
  return typeof value === "string" ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseBingDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const ticks = /\/Date\((\d+)/.exec(value);
  if (ticks) {
    const date = new Date(Number(ticks[1]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function bingGet<T>(input: {
  method: string;
  apiKey: string;
  params?: Record<string, string>;
  fetchImpl?: typeof fetch;
  map: (payload: unknown) => T;
}): Promise<T> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) {
    throw new BingWebmasterError("A Bing Webmaster API key is required.", 0);
  }

  const url = new URL(`${BING_WEBMASTER_JSON_BASE}/${input.method}`);
  url.searchParams.set("apikey", apiKey);
  for (const [name, value] of Object.entries(input.params ?? {})) {
    url.searchParams.set(name, value);
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
    });
  } catch (error) {
    throw new BingWebmasterError(
      `Bing Webmaster request failed: ${safeErrorMessage(error, apiKey)}`,
    );
  }

  const bodyText = await response.text();
  let payload: unknown = null;
  try {
    payload = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const payloadRecord = asRecord(payload);
    const message =
      stringField(payloadRecord, "Message") ??
      stringField(payloadRecord, "message") ??
      `Bing Webmaster returned HTTP ${response.status}.`;
    throw new BingWebmasterError(
      redactApiKeyQuery(safeErrorMessage(message, apiKey)),
      response.status,
    );
  }

  try {
    return input.map(payload);
  } catch (error) {
    throw new BingWebmasterError(
      `Could not read the Bing Webmaster response: ${safeErrorMessage(error, apiKey)}`,
    );
  }
}

export function parseBingSitesPayload(payload: unknown): BingVerifiedSite[] {
  const rows = asArray(asRecord(payload)?.d);
  const sites: BingVerifiedSite[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;
    const url = typeof record.Url === "string" ? record.Url.trim() : "";
    if (!url) continue;
    if (record.IsVerified !== true) continue;
    // Never surface AuthenticationCode or DnsVerificationCode.
    sites.push({ url });
  }
  return sites;
}

export async function listVerifiedBingSites(input: {
  apiKey: string;
  fetchImpl?: typeof fetch;
}): Promise<BingVerifiedSite[]> {
  return bingGet({
    method: "GetUserSites",
    apiKey: input.apiKey,
    fetchImpl: input.fetchImpl,
    map: parseBingSitesPayload,
  });
}

export function parseBingQueryStatsPayload(
  payload: unknown,
  siteUrl: string,
  options?: { sinceMs?: number; limit?: number },
): BingQuerySummary {
  const sinceMs = options?.sinceMs;
  const limit = options?.limit ?? 25;
  const byQuery = new Map<string, BingQueryStat & { dated: boolean }>();

  for (const row of asArray(asRecord(payload)?.d)) {
    const record = asRecord(row);
    if (!record) continue;
    const query = typeof record.Query === "string" ? record.Query.trim() : "";
    if (!query) continue;
    const date = parseBingDate(record.Date);
    if (sinceMs != null && date && date.getTime() < sinceMs) continue;

    const current = byQuery.get(query) ?? {
      query,
      clicks: 0,
      impressions: 0,
      avgImpressionPosition: null,
      avgClickPosition: null,
      dated: false,
    };
    current.clicks += numberOrZero(record.Clicks);
    current.impressions += numberOrZero(record.Impressions);
    current.avgImpressionPosition = numberOrNull(record.AvgImpressionPosition);
    current.avgClickPosition = numberOrNull(record.AvgClickPosition);
    current.dated = current.dated || date != null;
    byQuery.set(query, current);
  }

  const ranked = [...byQuery.values()];
  // ES2022 typings have no Array#toSorted.
  ranked.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
  const queries = ranked.slice(0, limit).map(({ dated: _dated, ...stat }) => stat);

  return {
    siteUrl,
    queryCount: queries.length,
    totalClicks: queries.reduce((sum, row) => sum + row.clicks, 0),
    totalImpressions: queries.reduce((sum, row) => sum + row.impressions, 0),
    queries,
  };
}

export async function getBingQueryStats(input: {
  apiKey: string;
  siteUrl: string;
  fetchImpl?: typeof fetch;
  sinceMs?: number;
  limit?: number;
}): Promise<BingQuerySummary> {
  return bingGet({
    method: "GetQueryStats",
    apiKey: input.apiKey,
    params: { siteUrl: input.siteUrl },
    fetchImpl: input.fetchImpl,
    map: (payload) =>
      parseBingQueryStatsPayload(payload, input.siteUrl, {
        sinceMs: input.sinceMs,
        limit: input.limit,
      }),
  });
}

export async function assertVerifiedBingSite(input: {
  apiKey: string;
  siteUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<BingVerifiedSite> {
  const sites = await listVerifiedBingSites(input);
  const match = sites.find((site) => site.url === input.siteUrl);
  if (!match) {
    throw new BingWebmasterError(
      "That site is not in the verified sites for this Bing Webmaster API key. Verify the site in Bing Webmaster Tools first, then pick it from the list.",
    );
  }
  return match;
}
