import { useEffect, type ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { getClientAuthMode, usesBetterAuthClient } from "@/lib/auth-mode";
import { getSignInHref, getSignInHrefForLocation } from "@/lib/auth-redirect";
import { t } from "@/shared/i18n";

const CLOUDFLARE_SETUP_GUIDE_URL =
  "https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_CLOUDFLARE.md#2-configure-authentication-and-secrets";

type CardProps = {
  message: string;
  onRetry: () => void;
};

/**
 * The card for an auth failure, else `fallback`. The route error boundary and
 * the landing redirect both render errors through this, so each auth error
 * code shows the same card everywhere.
 */
export function AuthErrorCard({
  error,
  onRetry,
  fallback,
}: {
  error: unknown;
  onRetry: () => void;
  fallback: ReactNode;
}) {
  const errorCode = getErrorCode(error);
  if (errorCode !== "AUTH_CONFIG_MISSING" && errorCode !== "UNAUTHENTICATED") {
    return fallback;
  }

  const message = getStandardErrorMessage(
    error,
    t("common.somethingWentWrongTryAgain"),
  );
  return (
    <div className="flex h-full min-w-0 flex-1 items-center justify-center p-4">
      {errorCode === "AUTH_CONFIG_MISSING" ? (
        <AuthConfigErrorCard message={message} onRetry={onRetry} />
      ) : (
        <UnauthenticatedErrorCard message={message} onRetry={onRetry} />
      )}
    </div>
  );
}

function AuthConfigErrorCard({ message, onRetry }: CardProps) {
  // The hint names the settings of the mode the server actually runs; the
  // alert above already carries the server's exact message.
  const clientAuthMode = getClientAuthMode();

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="size-5 text-destructive" />
          {t("ui.authenticationSetupRequired")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{message}</AlertDescription>
        </Alert>

        {clientAuthMode === "hosted" ? (
          <p className="text-muted-foreground">
            {t("ui.hostedModeRequires")}{" "}
            <code className="mx-1">BETTER_AUTH_SECRET</code>
            {t("ui.32Characters")} <code className="mx-1">BETTER_AUTH_URL</code>
            {t("ui.andGoogleOauthCredentialsOnThe")}
          </p>
        ) : null}
        {clientAuthMode === "everyapp" ? (
          <p className="text-muted-foreground">
            {t("ui.openseoRunsBehindAnEveryApp")}{" "}
            <code className="mx-1">pnpm everyapp install</code>{" "}
            {t("ui.soItGetsTheGatewayS")}
          </p>
        ) : null}
        {clientAuthMode === "cloudflare_access" ? (
          <p className="text-muted-foreground">
            {t("ui.cloudflareAccessModeRequires")}
            <code className="mx-1">TEAM_DOMAIN</code> {t("ui.aFullHttpsUrlAnd")}
            <code className="mx-1">POLICY_AUD</code>{" "}
            {t("ui.setOnTheDeploymentWithAn")}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="ghost" onClick={onRetry}>
          {t("ui.tryAgain")}
        </Button>
        <Button
          nativeButton={false}
          render={
            <a
              href={CLOUDFLARE_SETUP_GUIDE_URL}
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          {t("ui.openSetupGuide")}
        </Button>
      </CardFooter>
    </Card>
  );
}

function UnauthenticatedErrorCard({ message, onRetry }: CardProps) {
  // A sign-in page exists wherever Better Auth accounts do.
  const hasSignIn = usesBetterAuthClient();
  const signInHref =
    typeof window === "undefined"
      ? getSignInHref("/")
      : getSignInHrefForLocation(window.location);

  useEffect(() => {
    if (typeof window === "undefined" || !hasSignIn) {
      return;
    }

    window.location.replace(signInHref);
  }, [hasSignIn, signInHref]);

  if (hasSignIn) {
    return null;
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{t("ui.authenticationRequired")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-muted-foreground">
        <p>{message}</p>
        <p>{t("ui.thisDeploymentUsesExternalAuthenticationRefresh")}</p>
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={onRetry}>{t("ui.tryAgain")}</Button>
      </CardFooter>
    </Card>
  );
}
