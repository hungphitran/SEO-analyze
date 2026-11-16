import { BingWebmasterConnectionRepository } from "@/server/features/free-sources/repositories/BingWebmasterConnectionRepository";
import { AppError } from "@/server/lib/errors";
import { bingRefreshMessage } from "@/server/lib/free-sources/bing";
import {
  getBingCrawlIssues,
  getBingLinkCounts,
  getBingPageStats,
  type BingCrawlIssuesSummary,
  type BingLinkCountsSummary,
  type BingPageSummary,
} from "@/server/lib/free-sources/bing-extended";
import { openSecret } from "@/server/lib/free-sources/secret-box";

const QUERY_LIMIT = 25;
const TWENTY_EIGHT_DAYS_MS = 28 * 24 * 60 * 60 * 1000;

export async function openBingApiKey(
  encryptedApiKey: string,
): Promise<{ ok: true; apiKey: string } | { ok: false; message: string }> {
  try {
    return { ok: true, apiKey: await openSecret(encryptedApiKey) };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof AppError && error.code === "AUTH_CONFIG_MISSING"
          ? error.message
          : "The stored Bing Webmaster key could not be decrypted. Disconnect and save the key again after checking BETTER_AUTH_SECRET.",
    };
  }
}

type BingSectionResult<T> =
  | { status: "ok"; data: T }
  | { status: "error"; message: string };

export async function getBingSiteDetails(input: { projectId: string }): Promise<
  | { connected: false }
  | {
      connected: true;
      siteUrl: string;
      error: string | null;
      pages: BingSectionResult<BingPageSummary> | null;
      links: BingSectionResult<BingLinkCountsSummary> | null;
      crawlIssues: BingSectionResult<BingCrawlIssuesSummary> | null;
    }
> {
  const connection = await BingWebmasterConnectionRepository.getByProjectId(
    input.projectId,
  );
  if (!connection) return { connected: false };

  const opened = await openBingApiKey(connection.encryptedApiKey);
  if (!opened.ok) {
    return {
      connected: true,
      siteUrl: connection.siteUrl,
      error: opened.message,
      pages: null,
      links: null,
      crawlIssues: null,
    };
  }

  const { apiKey } = opened;
  const sinceMs = Date.now() - TWENTY_EIGHT_DAYS_MS;
  const settle = async <T>(
    fn: () => Promise<T>,
  ): Promise<BingSectionResult<T>> => {
    try {
      return { status: "ok", data: await fn() };
    } catch (error) {
      return {
        status: "error",
        message: bingRefreshMessage(error, apiKey),
      };
    }
  };

  // Run sequentially to avoid triggering Bing's shared-IP throttling on bursts.
  const pages = await settle(() =>
    getBingPageStats({
      apiKey,
      siteUrl: connection.siteUrl,
      sinceMs,
      limit: QUERY_LIMIT,
    }),
  );
  const links = await settle(() =>
    getBingLinkCounts({
      apiKey,
      siteUrl: connection.siteUrl,
      limit: QUERY_LIMIT,
    }),
  );
  const crawlIssues = await settle(() =>
    getBingCrawlIssues({
      apiKey,
      siteUrl: connection.siteUrl,
      limit: QUERY_LIMIT,
    }),
  );

  return {
    connected: true,
    siteUrl: connection.siteUrl,
    error: null,
    pages,
    links,
    crawlIssues,
  };
}
