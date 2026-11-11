import { z } from "zod";
import {
  HOSTED_PASSWORD_MAX_LENGTH,
  HOSTED_PASSWORD_MIN_LENGTH,
} from "@/lib/auth-options";
import { t } from "@/shared/i18n";

export const passwordSchema = z
  .string()
  .min(
    HOSTED_PASSWORD_MIN_LENGTH,
    t("auth.passwordMin", { min: HOSTED_PASSWORD_MIN_LENGTH }),
  )
  .max(
    HOSTED_PASSWORD_MAX_LENGTH,
    t("auth.passwordMax", { max: HOSTED_PASSWORD_MAX_LENGTH }),
  );
