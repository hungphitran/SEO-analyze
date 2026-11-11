import { AlertCircle } from "lucide-react";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { t } from "@/shared/i18n";

export function RemoveSavedKeywordsError({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function DeleteSavedKeywordsModal({
  selectedCount,
  isPending,
  onClose,
  onConfirm,
}: {
  selectedCount: number;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      title={t("saved.deleteKeywordsTitle")}
      confirmLabel={t("ui.deleteKeyword", { v0: selectedCount })}
      destructive
      pending={isPending}
      onClose={onClose}
      onConfirm={onConfirm}
    >{t("ui.thisWillPermanentlyDeleteSavedKeyword", { v0: selectedCount })}</ConfirmDialog>
  );
}
