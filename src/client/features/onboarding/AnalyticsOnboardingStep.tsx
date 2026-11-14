import { useMutation } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import { Switch } from "@/client/components/ui/switch";
import {
  updatePrivacyChoices,
  usePrivacyChoices,
} from "@/client/components/PrivacyChoices";
import { WizardFooter } from "@/client/features/onboarding/WizardFooter";
import { useSession } from "@/lib/auth-client";
import { setProductUpdatesOptIn } from "@/serverFunctions/product-updates";
import type { PrivacyChoices } from "@/shared/privacy-choices";
import { PRIVACY_URL } from "@/shared/terms";
import { t } from "@/shared/i18n";

/** Onboarding step for usage analytics and product-update emails. Each switch
 *  starts from the current choice, which is the region default until the user
 *  picks. Continue saves both. */
export function AnalyticsOnboardingStep({
  onBack,
  onNext,
}: {
  onBack: () => void;
  onNext: () => void;
}) {
  const choices = usePrivacyChoices();
  const { data: session, refetch } = useSession();
  // Unset until the user flips a switch.
  const [analytics, setAnalytics] = React.useState<boolean>();
  const [productUpdates, setProductUpdates] = React.useState<boolean>();

  const save = useMutation({
    // The email choice is only sent when the switch was flipped: signup
    // already applied the region default.
    mutationFn: async (next: {
      privacy: PrivacyChoices;
      productUpdates: boolean | undefined;
    }) => {
      await Promise.all([
        updatePrivacyChoices(next.privacy, true),
        next.productUpdates === undefined
          ? null
          : setProductUpdatesOptIn({ data: { optIn: next.productUpdates } }),
      ]);
      // The session is served from a signed cookie cache, so bypass it for
      // Settings to show the saved email choice.
      await refetch({ query: { disableCookieCache: true } });
    },
    // A failed email sync shouldn't trap anyone in onboarding.
    onError: () => toast.error(t("onboarding.emailChoiceSaveFailed")),
    onSettled: onNext,
  });

  if (!choices) return null;
  const analyticsOn = analytics ?? choices.analytics;
  const productUpdatesOn =
    productUpdates ?? session?.user.productUpdatesOptIn === true;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("onboarding.helpMakeBetter")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("onboarding.changeAnytimePrefix")}{" "}
          <a
            href={PRIVACY_URL}
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline underline-offset-2"
          >
            {t("onboarding.privacyPolicy")}
          </a>
          .
        </p>
      </div>
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm">{t("onboarding.usageAnalytics")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("onboarding.usageAnalyticsDesc")}
          </p>
        </div>
        <Switch
          checked={analyticsOn}
          onCheckedChange={setAnalytics}
          aria-label={t("onboarding.shareUsageAria")}
        />
      </div>
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm">{t("onboarding.productUpdates")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("onboarding.productUpdatesDesc")}
          </p>
        </div>
        <Switch
          checked={productUpdatesOn}
          onCheckedChange={setProductUpdates}
          aria-label={t("onboarding.productUpdatesAria")}
        />
      </div>
      <WizardFooter
        onBack={onBack}
        continueAction={
          <Button
            type="button"
            className="font-semibold"
            pending={save.isPending}
            onClick={() =>
              save.mutate({
                privacy: { ...choices, analytics: analyticsOn },
                productUpdates,
              })
            }
          >
            {t("common.continue")}
            <ArrowRight className="size-4" />
          </Button>
        }
      />
    </div>
  );
}
