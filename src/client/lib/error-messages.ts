import { FREE_MAX_AUDIT_PAGES } from "@/shared/audit-limits";
import { GATEWAY_RENDERING_NOT_SET_UP_MESSAGE } from "@/shared/audit-rendering";
import { isErrorCode, type ErrorCode } from "@/shared/error-codes";
import { t } from "@/shared/i18n";
import { localizeSerpMessage } from "@/shared/serp-error-messages";
import {
  isEveryAppClientAuthMode,
  isHostedClientAuthMode,
} from "@/lib/auth-mode";

/**
 * Copy for an error we did not expect. Hosted users cannot read our logs, so
 * they get support; a self-hoster runs the server and can.
 */
export const UNEXPECTED_ERROR_MESSAGE = isHostedClientAuthMode()
  ? t("errors.UNEXPECTED_hosted")
  : t("errors.UNEXPECTED_selfhost");

const STANDARD_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: t("errors.UNAUTHENTICATED"),
  AUTH_CONFIG_MISSING: isEveryAppClientAuthMode()
    ? t("errors.AUTH_CONFIG_MISSING_everyapp")
    : t("errors.AUTH_CONFIG_MISSING"),
  PAYMENT_REQUIRED: t("errors.PAYMENT_REQUIRED"),
  INSUFFICIENT_CREDITS: t("errors.INSUFFICIENT_CREDITS"),
  PAYMENT_METHOD_REQUIRED: t("errors.PAYMENT_METHOD_REQUIRED"),
  PAYMENT_ACTION_REQUIRED: t("errors.PAYMENT_ACTION_REQUIRED"),
  AUDIT_RENDERING_UNAVAILABLE: isEveryAppClientAuthMode()
    ? GATEWAY_RENDERING_NOT_SET_UP_MESSAGE
    : t("errors.AUDIT_RENDERING_UNAVAILABLE"),
  FORBIDDEN: t("errors.FORBIDDEN"),
  NOT_FOUND: t("errors.NOT_FOUND"),
  AUDIT_CAPACITY_REACHED: t("errors.AUDIT_CAPACITY_REACHED"),
  AUDIT_PAGE_LIMIT_EXCEEDED: t("errors.AUDIT_PAGE_LIMIT_EXCEEDED", {
    max: FREE_MAX_AUDIT_PAGES,
  }),
  AUDIT_ALREADY_RUNNING: t("errors.AUDIT_ALREADY_RUNNING"),
  VALIDATION_ERROR: t("errors.VALIDATION_ERROR"),
  UNKNOWN_LOCATION: t("errors.UNKNOWN_LOCATION"),
  CRAWL_TARGET_BLOCKED: t("errors.CRAWL_TARGET_BLOCKED"),
  BACKLINKS_BILLING_ISSUE: t("errors.BACKLINKS_BILLING_ISSUE"),
  AI_SEARCH_BILLING_ISSUE: t("errors.AI_SEARCH_BILLING_ISSUE"),
  AI_VISIBILITY_ERROR: t("errors.AI_VISIBILITY_ERROR"),
  DATAFORSEO_AUTH_FAILED: isEveryAppClientAuthMode()
    ? t("errors.DATAFORSEO_AUTH_FAILED_everyapp")
    : t("errors.DATAFORSEO_AUTH_FAILED"),
  FREE_SOURCES_ONLY: t("errors.FREE_SOURCES_ONLY"),
  RATE_LIMITED: t("errors.RATE_LIMITED"),
  UPSTREAM_UNAVAILABLE: t("errors.UPSTREAM_UNAVAILABLE"),
  SERP_NOT_CONFIGURED: t("errors.SERP_NOT_CONFIGURED"),
  SERP_QUOTA_EXCEEDED: t("errors.SERP_QUOTA_EXCEEDED"),
  SERP_UNAVAILABLE: t("errors.SERP_UNAVAILABLE"),
  BING_KEY_REJECTED: t("errors.BING_KEY_REJECTED"),
  BING_SITE_NOT_VERIFIED: t("errors.BING_SITE_NOT_VERIFIED"),
  BING_UNAVAILABLE: t("errors.BING_UNAVAILABLE"),
  CONFLICT: t("errors.CONFLICT"),
  INTERNAL_ERROR: UNEXPECTED_ERROR_MESSAGE,
};

export function getStandardErrorMessage(
  error: unknown,
  fallback: string = STANDARD_MESSAGES.INTERNAL_ERROR,
): string {
  if (!(error instanceof Error)) return fallback;
  if (isErrorCode(error.message)) return STANDARD_MESSAGES[error.message];
  if (error.message) return localizeSerpMessage(error.message) ?? error.message;
  return fallback;
}

export function getErrorCode(error: unknown): ErrorCode | null {
  if (!(error instanceof Error)) return null;
  return isErrorCode(error.message) ? error.message : null;
}
