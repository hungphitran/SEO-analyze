/**
 * Bing Webmaster error model: the error class, classification of Bing's
 * ErrorCode/HTTP status, and mapping to client-facing AppError codes.
 */
import { AppError } from "@/server/lib/errors";
import { safeErrorMessage } from "@/server/lib/free-sources/redact";

/**
 * What went wrong, independent of Bing's wording, so the app can show clear
 * Vietnamese copy: key_rejected (401/403/InvalidApiKey), not_verified (site is
 * not a verified site of the key), throttled (429, ThrottleUser/Host),
 * ip_throttled (ThrottleIP: Bing limits the shared egress IP of the server,
 * seen from Cloudflare Workers even with a valid key), unavailable (network, 5xx,
 * timeout), invalid_response (unreadable payload), invalid_input (no key).
 */
export type BingErrorKind =
  | "key_rejected"
  | "not_verified"
  | "throttled"
  | "ip_throttled"
  | "unavailable"
  | "invalid_response"
  | "invalid_input";

export class BingWebmasterError extends Error {
  readonly status: number;
  readonly kind: BingErrorKind;
  /** Bing's own numeric ApiErrorCode from the error body, when it sent one. */
  readonly errorCode: number | null;

  constructor(
    message: string,
    status = 0,
    kind: BingErrorKind = "unavailable",
    errorCode: number | null = null,
  ) {
    super(message);
    this.name = "BingWebmasterError";
    this.status = status;
    this.kind = kind;
    this.errorCode = errorCode;
  }
}

// Bing's ApiErrorCode enum (Microsoft.Bing.Webmaster.Api.Interfaces).
export const BING_CODE_INVALID_API_KEY = 3;
export const BING_CODE_THROTTLE_USER = 4;
export const BING_CODE_THROTTLE_HOST = 5;
export const BING_CODE_NOT_AUTHORIZED = 14;
// Observed from Cloudflare Workers with a valid key: {"ErrorCode":17,
// "Message":"ERROR!!! ThrottleIP"}. Not in the public ApiErrorCode docs.
export const BING_CODE_THROTTLE_IP = 17;
export const BING_CODE_INVALID_URL = 7;
/**
 * Classify a non-2xx Bing response. Bing reports API errors as HTTP 400 with
 * `{ErrorCode, Message}`, so the numeric ErrorCode (then the HTTP status) is
 * authoritative; message text is only a fallback when no ErrorCode is present.
 * Only HTTP 429 or ThrottleUser/ThrottleHost count as throttling: loose word
 * matches such as "quota" used to turn unrelated errors into "too many
 * requests".
 */
export function kindForResponse(
  status: number,
  message: string,
  errorCode: number | null = null,
): BingErrorKind {
  if (errorCode === BING_CODE_INVALID_API_KEY) return "key_rejected";
  if (errorCode === BING_CODE_THROTTLE_IP) return "ip_throttled";
  if (
    errorCode === BING_CODE_THROTTLE_USER ||
    errorCode === BING_CODE_THROTTLE_HOST
  ) {
    return "throttled";
  }
  if (status === 429) return "throttled";
  if (status === 401 || status === 403) return "key_rejected";
  if (errorCode === BING_CODE_NOT_AUTHORIZED) return "key_rejected";
  if (errorCode === null) {
    if (/invalid.?api.?key|not.?authori[sz]ed|unauthori[sz]ed/i.test(message)) {
      return "key_rejected";
    }
    if (/throttleip/i.test(message)) return "ip_throttled";
    if (/throttle(user|host)/i.test(message)) return "throttled";
  }
  return "unavailable";
}

/** Safe, one-line diagnostics for Workers Logs. Never includes the key/URL. */
export function logBingFailure(fields: {
  method: string;
  status: number;
  errorCode: number | null;
  kind: BingErrorKind;
  message: string;
  attempts: number;
  retryAfter: string | null;
}) {
  console.warn(
    `bing.webmaster failure method=${fields.method} status=${fields.status} errorCode=${fields.errorCode ?? "none"} kind=${fields.kind} attempts=${fields.attempts} retryAfter=${fields.retryAfter ?? "none"} message=${JSON.stringify(fields.message.slice(0, 160))}`,
  );
}
/**
 * Turn a Bing client failure into an AppError whose code the browser maps to
 * Vietnamese guidance. The message is key-free (it was redacted at the source).
 */
export function toBingAppError(error: unknown): unknown {
  if (!(error instanceof BingWebmasterError)) return error;
  switch (error.kind) {
    case "key_rejected":
      return new AppError("BING_KEY_REJECTED", error.message);
    case "not_verified":
      return new AppError("BING_SITE_NOT_VERIFIED", error.message);
    case "invalid_input":
      return new AppError("VALIDATION_ERROR", error.message);
    case "ip_throttled":
      return new AppError("BING_IP_THROTTLED", error.message);
    case "throttled":
      // Bing's own ThrottleUser/ThrottleHost (or HTTP 429), not our app's
      // rate limit, so it gets its own code and accurate copy.
      return new AppError("BING_THROTTLED", error.message);
    default:
      return new AppError("BING_UNAVAILABLE", error.message);
  }
}

/** Fixed, key-free snapshot text per failure kind (localized in the browser). */
export function bingRefreshMessage(error: unknown, apiKey: string): string {
  if (error instanceof BingWebmasterError) {
    switch (error.kind) {
      case "key_rejected":
        return "Bing Webmaster rejected the stored API key. Disconnect and save a new key.";
      case "throttled":
        return "Bing Webmaster is throttling this key. Try again later.";
      case "ip_throttled":
        return "Bing Webmaster is limiting this server's IP address. Try again later.";
      case "invalid_response":
        return "Bing Webmaster returned an unreadable response.";
      case "unavailable":
        return "Bing Webmaster could not be reached. Try again in a few minutes.";
      default:
        break;
    }
  }
  return safeErrorMessage(error, apiKey);
}
