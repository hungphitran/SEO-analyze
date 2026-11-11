/**
 * Plain-language copy for Google OAuth failures, shared by the connect-surface
 * inline alert (GoogleLinkErrorAlert) and the /auth-error fallback page.
 * `code` is the `error` query param on the redirect: Google's own error code
 * (access_denied), or one set by googleOAuth.ts / Better Auth.
 *
 * `providerLabel` ("Search Console" / "Google Analytics") is set when the
 * failure came from a connect flow; without it the copy reads as a Google
 * sign-in failure.
 */
import { t } from "@/shared/i18n";

export function googleAuthErrorCopy(
  code: string,
  providerLabel?: string,
): { title: string; description: string } {
  const what = providerLabel
    ? t("integrations.connectionNoun", { what: providerLabel })
    : t("auth.googleSignIn");

  switch (code) {
    case "state_mismatch":
      return {
        title: t("integrations.didntFinish", { what }),
        description: t("integrations.errorStateMismatch"),
      };
    case "access_denied":
      return {
        title: t("integrations.wasCanceled", { what }),
        description: t("integrations.errorAccessDenied"),
      };
    case "scope_not_granted":
      return {
        title: t("integrations.missingPermission", { what }),
        description: t("integrations.errorScopeNotGranted", {
          provider: providerLabel ?? "Google",
        }),
      };
    case "connection_save_failed":
      return {
        title: t("integrations.didntFinish", { what }),
        description: t("integrations.errorSaveFailed"),
      };
    default:
      return {
        title: t("integrations.didntFinish", { what }),
        description: t("integrations.errorDefault"),
      };
  }
}
