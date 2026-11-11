import type { KeywordIntent } from "@/types/keywords";
import { Badge } from "@/client/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/client/components/ui/tooltip";
import { t } from "@/shared/i18n";

const VARIANTS: Record<
  KeywordIntent,
  "info" | "warning" | "success" | "soft" | "secondary"
> = {
  informational: "info",
  commercial: "warning",
  transactional: "success",
  navigational: "soft",
  unknown: "secondary",
};

const SHORT_LABELS: Record<KeywordIntent, string> = {
  informational: t("ui.info_313d"),
  commercial: t("ui.comm"),
  transactional: t("ui.trans"),
  navigational: t("ui.nav"),
  unknown: "?",
};

/** Full intent labels, shared with the keyword filters so both stay in sync. */
export const INTENT_LABELS: Record<KeywordIntent, string> = {
  informational: t("kw.intentInformational"),
  commercial: t("kw.intentCommercial"),
  transactional: t("kw.intentTransactional"),
  navigational: t("kw.intentNavigational"),
  unknown: t("ui.unknown"),
};

const DESCRIPTIONS: Record<
  KeywordIntent,
  { label: string; description: string }
> = {
  informational: {
    label: INTENT_LABELS.informational,
    description:
      t("kw.intentInformationalHelp"),
  },
  commercial: {
    label: INTENT_LABELS.commercial,
    description:
      t("kw.intentCommercialHelp"),
  },
  transactional: {
    label: INTENT_LABELS.transactional,
    description:
      t("kw.intentTransactionalHelp"),
  },
  navigational: {
    label: INTENT_LABELS.navigational,
    description:
      t("kw.intentNavigationalHelp"),
  },
  unknown: {
    label: INTENT_LABELS.unknown,
    description:
      t("kw.intentUnknownHelp"),
  },
};

export function IntentBadge({ intent }: { intent: KeywordIntent }) {
  const details = DESCRIPTIONS[intent];

  return (
    <Tooltip>
      <TooltipTrigger
        delay={0}
        render={
          <Badge
            variant={VARIANTS[intent]}
            tabIndex={0}
            className="h-6 min-w-11 cursor-help font-semibold"
          />
        }
        aria-label={t("ui.searchIntent", { v0: details.label })}
      >
        {SHORT_LABELS[intent]}
      </TooltipTrigger>
      <TooltipContent className="flex-col items-start gap-1">
        <span className="font-semibold">{details.label}</span>
        <span>{details.description}</span>
      </TooltipContent>
    </Tooltip>
  );
}
