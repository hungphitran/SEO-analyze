import {
  OpenSerpError,
  type OpenSerpErrorCode,
} from "@/server/lib/openserp";

export const MAX_RESPONSE_BYTES = 3_000_000;

export class SerpApiError extends OpenSerpError {
  /** Only transient transport failures are retried; never quota or auth. */
  readonly retryable: boolean;
  constructor(
    code: OpenSerpErrorCode,
    message: string,
    details?: ConstructorParameters<typeof OpenSerpError>[2],
    retryable = false,
  ) {
    super(code, message, details);
    this.name = "SerpApiError";
    this.retryable = retryable;
  }
}


export function errorForStatus(response: Response, apiMessage: string): SerpApiError {
  return errorForMessage(apiMessage, response.status, undefined, {
    retryAfterSeconds: parseRetryAfter(response.headers.get("retry-after")),
  });
}

/**
 * Map SerpApi's HTTP status and/or JSON `error` text (which can arrive with
 * HTTP 200) to one stable code. Only 5xx/408/504 are retryable; quota, auth
 * and throughput errors never are, because retrying would only burn quota.
 */
export function errorForMessage(
  apiMessage: string,
  status?: number,
  requestId?: string,
  extra?: { retryAfterSeconds?: number },
): SerpApiError {
  const details = { httpStatus: status, requestId, ...extra };
  if (status === 401 || status === 403 || /invalid api key/i.test(apiMessage)) {
    return new SerpApiError(
      "configuration_error",
      "SerpApi rejected the API key; no rank was recorded.",
      details,
    );
  }
  if (/out of searches|plan.*(limit|exceed)|monthly.*limit/i.test(apiMessage)) {
    return new SerpApiError(
      "quota_exceeded",
      "SerpApi plan search limit reached; no rank was recorded.",
      details,
    );
  }
  if (
    status === 429 ||
    /throughput|too many requests|rate limit/i.test(apiMessage)
  ) {
    return new SerpApiError(
      "rate_limited",
      "SerpApi rate-limited the request (hourly throughput); no rank was recorded.",
      details,
    );
  }
  if (status === 408 || status === 504) {
    return new SerpApiError(
      "timeout",
      "SerpApi request timed out; no rank was recorded.",
      details,
      true,
    );
  }
  return new SerpApiError(
    "upstream_error",
    "SerpApi request failed; no rank was recorded.",
    details,
    status !== undefined && status >= 500,
  );
}

export async function readBounded(response: Response): Promise<string> {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) {
    throw new SerpApiError(
      "invalid_response",
      "SerpApi response was too large.",
    );
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new SerpApiError(
      "invalid_response",
      "SerpApi response was too large.",
    );
  }
  return text;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.max(0, seconds) : undefined;
}
