/**
 * Open PageRank API client: a 0 to 10 domain authority score.
 *
 * Docs: https://www.domcop.com/openpagerank/documentation
 * Plans: https://keywordseverywhere.com/openpagerank/pricing (free: 30,000
 * domains per month, 60 requests per minute).
 *
 * Endpoint: POST https://openpagerank.keywordseverywhere.com/v1/domains/bulk
 * with `Authorization: Bearer <key>`. One request carries up to 100 domains,
 * so lookups are batched. Free keys are bound to one IPv4 address: a call from
 * any other address is refused with 403 `address_error`, which is reported as
 * its own state instead of a generic failure.
 */
import { sortBy } from "remeda";
import { safeErrorMessage } from "@/server/lib/free-sources/redact";

export const OPEN_PAGERANK_ENDPOINT =
  "https://openpagerank.keywordseverywhere.com/v1/domains/bulk";
export const OPEN_PAGERANK_MAX_DOMAINS_PER_REQUEST = 100;
export const OPEN_PAGERANK_REQUESTS_PER_MINUTE = 60;

export type OpenPageRankErrorKind =
  | "rate_limited"
  | "quota"
  | "address"
  | "auth"
  | "http";

export class OpenPageRankError extends Error {
  readonly kind: OpenPageRankErrorKind;
  readonly status: number;
  readonly retryAfterSeconds: number;

  constructor(
    message: string,
    kind: OpenPageRankErrorKind,
    status: number,
    retryAfterSeconds = 0,
  ) {
    super(message);
    this.name = "OpenPageRankError";
    this.kind = kind;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Sliding-window limiter (in-memory, one per isolate). The service layer adds a
 * KV counter on top so isolates share the budget on a best-effort basis.
 */
export class SlidingWindowRateLimiter {
  private readonly stamps: number[] = [];

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Reserve one slot; when the window is full, say how long to wait. */
  tryAcquire(): { ok: true } | { ok: false; retryAfterMs: number } {
    const now = this.now();
    while (this.stamps.length > 0 && now - this.stamps[0] >= this.windowMs) {
      this.stamps.shift();
    }
    if (this.stamps.length >= this.limit) {
      return {
        ok: false,
        retryAfterMs: Math.max(1, this.windowMs - (now - this.stamps[0])),
      };
    }
    this.stamps.push(now);
    return { ok: true };
  }
}

const defaultLimiter = new SlidingWindowRateLimiter(
  OPEN_PAGERANK_REQUESTS_PER_MINUTE,
  60_000,
);

export type OpenPageRankEntry = {
  /** Registered domain the score belongs to. */
  domain: string;
  /** 0 to 10 with up to 2 decimals; null when the domain is not found. */
  score: number | null;
  rank: number | null;
  referringDomains: number | null;
  /** Present when the queried name was a subdomain. */
  host: { name: string; score: number | null; rank: number | null } | null;
};

export type OpenPageRankLookup = {
  entries: Map<string, OpenPageRankEntry | null>;
  asOf: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return Object.fromEntries(Object.entries(value));
}

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Lower-case a hostname and drop a trailing dot, a leading "www." and any port. */
export function normalizeHostname(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/\.$/, "")
    .replace(/^www\./, "");
}

/**
 * Map a /v1/domains/bulk body onto the queried hostnames. A result belongs to a
 * hostname when it is that hostname or a parent of it; the longest match wins.
 */
export function parseOpenPageRankPayload(
  payload: unknown,
  hostnames: string[],
): OpenPageRankLookup {
  const root = asRecord(payload);
  const results = Array.isArray(root?.results) ? root.results : [];
  const parsed = results
    .map((raw) => asRecord(raw))
    .filter((row): row is Record<string, unknown> => row != null)
    .filter((row) => typeof row.domain === "string");

  const entries = new Map<string, OpenPageRankEntry | null>();
  for (const hostname of hostnames) {
    const row = sortBy(
      parsed.filter((candidate) => {
        const domain = String(candidate.domain).toLowerCase();
        return hostname === domain || hostname.endsWith(`.${domain}`);
      }),
      // Longest (most specific) parent domain first.
      (candidate) => -String(candidate.domain).length,
    )[0];
    if (!row) {
      entries.set(hostname, null);
      continue;
    }
    const hosts = Array.isArray(row.hosts) ? row.hosts : [];
    const hostRow = hosts
      .map((raw) => asRecord(raw))
      .find((candidate) => candidate?.host === hostname);
    const hostEntry =
      hostRow && hostRow.found !== false
        ? {
            name: hostname,
            score: num(hostRow.open_page_rank),
            rank: num(hostRow.rank),
          }
        : null;
    const score = row.found === false ? null : num(row.open_page_rank);
    if (score == null && !hostEntry) {
      entries.set(hostname, null);
      continue;
    }
    entries.set(hostname, {
      domain: String(row.domain),
      score,
      rank: num(row.rank),
      referringDomains: num(row.referring_domains),
      host: hostEntry,
    });
  }
  return {
    entries,
    asOf: typeof root?.as_of === "string" ? root.as_of : null,
  };
}

function errorFromResponse(
  status: number,
  payload: unknown,
  headers: Headers,
  apiKey: string,
): OpenPageRankError {
  const error = asRecord(asRecord(payload)?.error);
  const type = typeof error?.type === "string" ? error.type : "";
  const message = safeErrorMessage(
    (typeof error?.message === "string" && error.message) ||
      `Open PageRank returned HTTP ${status}.`,
    apiKey,
  );
  if (status === 401) {
    return new OpenPageRankError(message, "auth", status);
  }
  if (status === 403) {
    return new OpenPageRankError(
      message,
      type === "address_error" ? "address" : "auth",
      status,
    );
  }
  if (status === 429) {
    const reset = num(headers.get("X-RateLimit-Reset"));
    const retryAfter =
      num(headers.get("Retry-After")) ??
      (reset != null ? Math.max(1, Math.ceil(reset - Date.now() / 1000)) : 60);
    return new OpenPageRankError(
      message,
      type === "quota_error" ? "quota" : "rate_limited",
      status,
      type === "quota_error" ? 0 : Math.min(retryAfter, 300),
    );
  }
  return new OpenPageRankError(message, "http", status);
}

/**
 * Look up many hostnames, batching up to 100 per request and spending one
 * limiter slot per request. Hostnames are normalized and de-duplicated first.
 */
export async function lookupOpenPageRank(input: {
  hostnames: string[];
  apiKey: string;
  fetchImpl?: typeof fetch;
  limiter?: {
    tryAcquire(): { ok: true } | { ok: false; retryAfterMs: number };
  };
}): Promise<OpenPageRankLookup> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) {
    throw new OpenPageRankError(
      "Open PageRank is not configured. Set OPEN_PAGERANK_API_KEY.",
      "auth",
      0,
    );
  }
  const hostnames = [
    ...new Set(input.hostnames.map(normalizeHostname).filter(Boolean)),
  ];
  const entries = new Map<string, OpenPageRankEntry | null>();
  let asOf: string | null = null;
  const fetchImpl = input.fetchImpl ?? fetch;
  const limiter = input.limiter ?? defaultLimiter;

  for (
    let start = 0;
    start < hostnames.length;
    start += OPEN_PAGERANK_MAX_DOMAINS_PER_REQUEST
  ) {
    const batch = hostnames.slice(
      start,
      start + OPEN_PAGERANK_MAX_DOMAINS_PER_REQUEST,
    );
    const slot = limiter.tryAcquire();
    if (!slot.ok) {
      throw new OpenPageRankError(
        "Open PageRank request limit reached (60 requests per minute).",
        "rate_limited",
        0,
        Math.ceil(slot.retryAfterMs / 1000),
      );
    }

    let response: Response;
    try {
      response = await fetchImpl(OPEN_PAGERANK_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ domains: batch, include_history: false }),
      });
    } catch (error) {
      throw new OpenPageRankError(
        `Open PageRank request failed: ${safeErrorMessage(error, apiKey)}`,
        "http",
        0,
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
      throw errorFromResponse(
        response.status,
        payload,
        response.headers,
        apiKey,
      );
    }

    const parsed = parseOpenPageRankPayload(payload, batch);
    asOf = parsed.asOf ?? asOf;
    for (const [hostname, entry] of parsed.entries) {
      entries.set(hostname, entry);
    }
  }
  return { entries, asOf };
}
