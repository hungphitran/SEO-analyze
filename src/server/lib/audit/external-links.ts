/**
 * Broken external link check, run once at audit finalize.
 *
 * The crawl records a capped list of external targets per page. Here a capped,
 * time-limited sample of the distinct targets is probed with HEAD requests; a
 * target is only called broken after a ranged GET agrees (some servers answer
 * HEAD with 404 for pages that exist). Only 404 and 410 count: 401, 403, 429
 * and 999 are bot protection, and a network error says nothing reliable.
 */
import { isCrawlableUrl } from "@/server/lib/audit/url-policy";
import { publicFetch } from "@/server/lib/public-fetch";
import { auditRequestHeaders } from "@/server/lib/audit/web-bot-auth";
import type { ExternalLinkRow } from "@/server/features/audit/AuditScratchpad";

/** Distinct external targets probed per audit. */
export const MAX_EXTERNAL_TARGETS = 100;
/** Edge rows read from the scratchpad (a target may appear on many pages). */
export const MAX_EXTERNAL_EDGE_ROWS = 5_000;
const MAX_SOURCES_PER_TARGET = 10;
const MAX_ISSUES = 500;
const CONCURRENCY = 8;
const REQUEST_TIMEOUT_MS = 5_000;
const TOTAL_BUDGET_MS = 40_000;
const BROKEN_STATUSES = new Set([404, 410]);

/** A source page and the external target that answered 404/410. */
export interface BrokenExternalLink {
  pageId: string;
  pageUrl: string;
  targetUrl: string;
  targetStatus: number;
}

export type ExternalFetch = (
  url: string,
  init: RequestInit,
) => Promise<{ status: number }>;

interface Target {
  url: string;
  sources: Array<{ pageId: string; pageUrl: string }>;
}

/** Group edge rows by target, keeping the first MAX_EXTERNAL_TARGETS targets. */
export function groupExternalTargets(rows: ExternalLinkRow[]): Target[] {
  const targets = new Map<string, Target>();
  for (const row of rows) {
    let target = targets.get(row.targetUrl);
    if (!target) {
      if (targets.size >= MAX_EXTERNAL_TARGETS) continue;
      if (!isCrawlableUrl(row.targetUrl)) continue;
      target = { url: row.targetUrl, sources: [] };
      targets.set(row.targetUrl, target);
    }
    if (target.sources.length < MAX_SOURCES_PER_TARGET) {
      target.sources.push({ pageId: row.pageId, pageUrl: row.pageUrl });
    }
  }
  return Array.from(targets.values());
}

const defaultFetch: ExternalFetch = (url, init) => publicFetch(url, init);

async function probe(
  url: string,
  method: "HEAD" | "GET",
  doFetch: ExternalFetch,
): Promise<number | null> {
  try {
    const headers = await auditRequestHeaders(url, null);
    if (method === "GET") headers["Range"] = "bytes=0-0";
    const response = await doFetch(url, {
      method,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return response.status;
  } catch {
    return null;
  }
}

/** Status of a target when it looks broken (404/410 on HEAD and GET), else null. */
async function confirmBroken(
  url: string,
  doFetch: ExternalFetch,
): Promise<number | null> {
  const head = await probe(url, "HEAD", doFetch);
  if (head === null || !BROKEN_STATUSES.has(head)) return null;
  const get = await probe(url, "GET", doFetch);
  return get !== null && BROKEN_STATUSES.has(get) ? get : null;
}

export async function findBrokenExternalLinks(
  rows: ExternalLinkRow[],
  options: { doFetch?: ExternalFetch; now?: () => number } = {},
): Promise<BrokenExternalLink[]> {
  const doFetch = options.doFetch ?? defaultFetch;
  const now = options.now ?? Date.now;
  const targets = groupExternalTargets(rows);
  const deadline = now() + TOTAL_BUDGET_MS;
  const broken: BrokenExternalLink[] = [];
  let next = 0;

  const worker = async () => {
    while (next < targets.length && now() < deadline) {
      const target = targets[next++];
      const status = await confirmBroken(target.url, doFetch);
      if (status === null) continue;
      for (const source of target.sources) {
        if (broken.length >= MAX_ISSUES) return;
        broken.push({
          pageId: source.pageId,
          pageUrl: source.pageUrl,
          targetUrl: target.url,
          targetStatus: status,
        });
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return broken;
}
