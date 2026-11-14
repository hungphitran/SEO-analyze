/**
 * Pacing for Cloudflare Browser Run `quickAction` calls. The Workers Free plan
 * allows one request every 10 seconds per account, so a crawl that renders
 * pages back to back is answered with 429 for all but the first. The interval
 * comes from BROWSER_RENDER_MIN_INTERVAL_MS (0 or unset = no pacing, which is
 * right for paid plans); self-host deployments default it to 10 seconds in
 * deploy/alchemy/alchemy.run.ts.
 */
import { parseRetryAfterMs } from "./crawl-throttle";

export const BROWSER_RENDER_INTERVAL_ENV = "BROWSER_RENDER_MIN_INTERVAL_MS";
/** Never wait longer than this for one render slot or one Retry-After. */
const MAX_PACING_WAIT_MS = 30_000;
const MAX_INTERVAL_MS = 60_000;

/** Milliseconds between renders; 0 when unset or invalid. */
export function parseRenderIntervalMs(raw: string | undefined): number {
  if (!raw) return 0;
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.round(value), MAX_INTERVAL_MS);
}

/** The wait before retrying a 429: Retry-After if sent, else one interval. */
export function renderRetryDelayMs(
  retryAfter: string | null,
  intervalMs: number,
): number {
  const fromHeader = parseRetryAfterMs(retryAfter);
  return Math.min(
    Math.max(fromHeader ?? intervalMs, intervalMs),
    MAX_PACING_WAIT_MS,
  );
}

/**
 * Shared across crawl workers and audits. `reserve` returns how long this
 * caller must wait for its turn; `defer` pushes every later turn back after a
 * 429 so concurrent callers do not each hit the limit again.
 */
export interface RenderPacer {
  intervalMs: number;
  reserve(): Promise<number>;
  defer(delayMs: number): Promise<void>;
  sleep(ms: number): Promise<void>;
}

/** Slot arithmetic kept pure so the Durable Object method is trivially testable. */
export function nextRenderSlot(
  nextAt: number,
  now: number,
  intervalMs: number,
): { waitMs: number; nextAt: number } {
  const start = Math.max(now, nextAt);
  return {
    waitMs: Math.min(start - now, MAX_PACING_WAIT_MS),
    nextAt: start + intervalMs,
  };
}
