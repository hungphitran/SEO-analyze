/**
 * PageSpeed Insights API v5 client (Lighthouse lab data).
 *
 * Official guide: https://developers.google.com/speed/docs/insights/v5/get-started
 * Endpoint: GET https://www.googleapis.com/pagespeedonline/v5/runPagespeed
 *
 * The API key is sent as the X-goog-api-key header so it does not appear in
 * the request URL (and therefore not in URL-bearing error messages).
 * A key is required: keyless requests are not a usable fallback.
 */
import { safeErrorMessage } from "@/server/lib/free-sources/redact";
import type { LighthouseResult } from "@/server/lib/audit/types";
import { buildPagespeedReport } from "@/server/lib/free-sources/pagespeedReport";
import type { StoredLighthousePayload } from "@/server/lib/lighthouseStoredPayload";

export const PAGESPEED_ENDPOINT =
  "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

const PAGESPEED_CATEGORIES = [
  "performance",
  "accessibility",
  "best-practices",
  "seo",
] as const;

type PagespeedStrategy = "mobile" | "desktop";

export class PagespeedError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = "PagespeedError";
    this.status = status;
    this.retryable = retryable;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return Object.fromEntries(Object.entries(value));
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function scoreTo100(value: unknown): number | null {
  const score = numeric(value);
  if (score == null) return null;
  return Math.round(score * 100);
}

function auditNumeric(
  audits: Record<string, unknown> | null,
  id: string,
): number | null {
  if (!audits) return null;
  return numeric(asRecord(audits[id])?.numericValue);
}

type ParsedPagespeedScores = {
  performanceScore: number | null;
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  seoScore: number | null;
  lcpMs: number | null;
  cls: number | null;
  inpMs: number | null;
  ttfbMs: number | null;
  requestedUrl: string | null;
  fetchTime: string | null;
};

export function parsePagespeedPayload(payload: unknown): ParsedPagespeedScores {
  const root = asRecord(payload);
  const lighthouse = asRecord(root?.lighthouseResult);
  const categories = asRecord(lighthouse?.categories);
  const audits = asRecord(lighthouse?.audits);

  return {
    performanceScore: scoreTo100(asRecord(categories?.performance)?.score),
    accessibilityScore: scoreTo100(asRecord(categories?.accessibility)?.score),
    bestPracticesScore: scoreTo100(
      asRecord(categories?.["best-practices"])?.score,
    ),
    seoScore: scoreTo100(asRecord(categories?.seo)?.score),
    lcpMs: auditNumeric(audits, "largest-contentful-paint"),
    cls: auditNumeric(audits, "cumulative-layout-shift"),
    inpMs: auditNumeric(audits, "interaction-to-next-paint"),
    ttfbMs: auditNumeric(audits, "server-response-time"),
    requestedUrl:
      typeof lighthouse?.requestedUrl === "string"
        ? lighthouse.requestedUrl
        : typeof lighthouse?.finalUrl === "string"
          ? lighthouse.finalUrl
          : null,
    fetchTime:
      typeof lighthouse?.fetchTime === "string" ? lighthouse.fetchTime : null,
  };
}

/** The reduced scores plus the full stored payload (metrics, field data, audits). */
type PagespeedRun = {
  scores: ParsedPagespeedScores;
  report: StoredLighthousePayload;
};

export async function runPagespeedAudit(input: {
  url: string;
  strategy: PagespeedStrategy;
  apiKey: string;
  fetchImpl?: typeof fetch;
}): Promise<ParsedPagespeedScores> {
  return (await runPagespeedReport(input)).scores;
}

export async function runPagespeedReport(input: {
  url: string;
  strategy: PagespeedStrategy;
  apiKey: string;
  fetchImpl?: typeof fetch;
}): Promise<PagespeedRun> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) {
    throw new PagespeedError(
      "PageSpeed Insights is not configured. Set PAGESPEED_API_KEY.",
      0,
      false,
    );
  }

  const requestUrl = new URL(PAGESPEED_ENDPOINT);
  requestUrl.searchParams.set("url", input.url);
  requestUrl.searchParams.set("strategy", input.strategy);
  for (const category of PAGESPEED_CATEGORIES) {
    requestUrl.searchParams.append("category", category);
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(requestUrl, {
      method: "GET",
      headers: { "X-goog-api-key": apiKey },
    });
  } catch (error) {
    throw new PagespeedError(
      `PageSpeed Insights request failed: ${safeErrorMessage(error, apiKey)}`,
      0,
      true,
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
    const error = asRecord(asRecord(payload)?.error);
    const message =
      (typeof error?.message === "string" && error.message) ||
      `PageSpeed Insights returned HTTP ${response.status}.`;
    const retryable = response.status === 429 || response.status >= 500;
    throw new PagespeedError(
      safeErrorMessage(message, apiKey),
      response.status,
      retryable,
    );
  }

  const scores = parsePagespeedPayload(payload);
  const report = buildPagespeedReport({
    payload,
    url: input.url,
    strategy: input.strategy,
  });
  // Lab runs never measure INP; fall back to the real-user p75 when present.
  if (scores.inpMs == null) {
    scores.inpMs = report.metrics.interactionToNextPaint.numericValue;
  }
  return { scores, report };
}

export function pagespeedToLighthouseResult(input: {
  url: string;
  pageId: string;
  strategy: PagespeedStrategy;
  scores: ParsedPagespeedScores;
}): LighthouseResult {
  return {
    url: input.url,
    pageId: input.pageId,
    strategy: input.strategy,
    performanceScore: input.scores.performanceScore,
    accessibilityScore: input.scores.accessibilityScore,
    bestPracticesScore: input.scores.bestPracticesScore,
    seoScore: input.scores.seoScore,
    lcpMs: input.scores.lcpMs,
    cls: input.scores.cls,
    inpMs: input.scores.inpMs,
    ttfbMs: input.scores.ttfbMs,
  };
}
