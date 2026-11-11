import { parseResearchTarget } from "@/shared/researchScope";
import { createFormValidationErrors } from "@/client/lib/forms";
import type { DomainControlsValues } from "@/client/features/domain/types";
import { t } from "@/shared/i18n";

export function getDomainSearchValidationErrors(value: DomainControlsValues) {
  if (!value.domain.trim()) {
    return createFormValidationErrors({
      fields: {
        domain: t("domain.enterDomain"),
      },
    });
  }

  const parsed = parseResearchTarget(value.domain, value.scope);
  if (!parsed.ok) {
    return createFormValidationErrors({
      fields: {
        domain: parsed.message,
      },
    });
  }

  return null;
}

export function getDomainSearchChangeValidationErrors(
  value: DomainControlsValues,
  shouldValidateUntouchedField: boolean,
  shouldValidateFormat: boolean,
) {
  if (!value.domain.trim()) {
    if (!shouldValidateUntouchedField) {
      return null;
    }

    return createFormValidationErrors({
      fields: {
        domain: t("domain.enterDomain"),
      },
    });
  }

  if (!shouldValidateFormat) {
    return null;
  }

  return getDomainSearchValidationErrors(value);
}
