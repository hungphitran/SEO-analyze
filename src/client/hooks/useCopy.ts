import { useRef, useState } from "react";
import { toast } from "sonner";
import { t } from "@/shared/i18n";

/**
 * Copies text to the clipboard with a toast. `copied` stays true for two
 * seconds after a copy, for a check mark on the button.
 */
export function useCopy() {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const copy = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      toast.error(t("ui.couldNotCopyToClipboard"));
      return false;
    }
    toast.success(successMessage);
    setCopied(true);
    // A second copy restarts the two seconds.
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 2000);
    return true;
  };

  return { copied, copy };
}
