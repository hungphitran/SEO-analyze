import { Button } from "@/client/components/ui/button";
import { t } from "@/shared/i18n";

/** The Cancel and submit buttons at the end of a form. */
export function FormActions({
  pending,
  disabled = false,
  onCancel,
  size = "default",
}: {
  pending: boolean;
  disabled?: boolean;
  onCancel: () => void;
  size?: "xs" | "sm" | "default";
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        variant="ghost"
        size={size}
        onClick={onCancel}
        disabled={pending}
      >
        {t("common.cancel")}
      </Button>
      <Button type="submit" size={size} disabled={disabled} pending={pending}>
        {t("common.save")}
      </Button>
    </div>
  );
}
