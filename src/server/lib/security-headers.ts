/**
 * Response headers every app response carries (self-host hardening).
 *
 * Kept pure so it is unit-tested without booting the Worker. Headers the
 * route already set are never overwritten, so a route with its own stricter
 * policy (report sandbox CSP, share pages) keeps it.
 */

/** Paths meant to be fetched by crawlers or link unfurlers (shared reports). */
const INDEXABLE_PATH = /^\/(s|r|report-map)\//;

const STATIC_HEADERS: ReadonlyArray<readonly [string, string]> = [
  // One year, this host only. No `preload`/`includeSubDomains`: workers.dev
  // and custom domains share a parent we do not control.
  ["Strict-Transport-Security", "max-age=31536000"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  [
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  ],
];

const APP_FRAME_ANCESTORS_CSP = "frame-ancestors 'self'";

export function isNoindexPath(pathname: string): boolean {
  return !INDEXABLE_PATH.test(pathname);
}

export function withSecurityHeaders(
  pathname: string,
  response: Response,
): Response {
  const headers = new Headers(response.headers);
  let changed = false;
  const setIfMissing = (name: string, value: string) => {
    if (headers.has(name)) return;
    headers.set(name, value);
    changed = true;
  };

  for (const [name, value] of STATIC_HEADERS) setIfMissing(name, value);

  const isHtml = (headers.get("content-type") ?? "").startsWith("text/html");
  if (isHtml) {
    // frame-ancestors 'self' and X-Frame-Options SAMEORIGIN say the same
    // thing for old and new browsers. A route with its own CSP (the report
    // sandbox) keeps it, and its X-Frame-Options is not added either, since
    // that policy may intentionally allow a different framer.
    if (!headers.has("content-security-policy")) {
      setIfMissing("Content-Security-Policy", APP_FRAME_ANCESTORS_CSP);
      setIfMissing("X-Frame-Options", "SAMEORIGIN");
    }
  }

  if (isNoindexPath(pathname)) {
    setIfMissing("X-Robots-Tag", "noindex, nofollow");
  }

  if (!changed) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
