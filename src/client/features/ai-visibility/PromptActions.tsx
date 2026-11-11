import { Archive, Pause, Pencil, Play } from "lucide-react";
import { RowActionsMenu } from "@/client/components/RowActionsMenu";
import { DropdownMenuItem } from "@/client/components/ui/dropdown-menu";
import { t } from "@/shared/i18n";

/** The dots menu of a prompt or topic row in the tracked prompts table. */
export function PromptActionsMenu({
  label,
  kind,
  paused,
  scheduled,
  pending,
  onEdit,
  onTogglePause,
  onArchive,
}: {
  label: string;
  kind: "prompt" | "topic";
  paused: boolean;
  /** Pausing only skips scheduled runs, so it needs a schedule. */
  scheduled: boolean;
  pending: boolean;
  onEdit?: () => void;
  onTogglePause: () => void;
  onArchive: () => void;
}) {
  return (
    <RowActionsMenu label={label}>
      {onEdit && (
        <DropdownMenuItem onClick={onEdit}>
          <Pencil />
          {kind === "topic" ? t("ai.renameTopic") : t("ai.editPrompt")}
        </DropdownMenuItem>
      )}
      <DropdownMenuItem
        disabled={pending || (!paused && !scheduled)}
        onClick={onTogglePause}
      >
        {paused ? <Play /> : <Pause />}
        {paused
          ? kind === "topic"
            ? t("ui.resumeTopic")
            : t("ui.resumePrompt")
          : kind === "topic"
            ? t("ui.pauseTopic")
            : t("ui.pausePrompt")}
      </DropdownMenuItem>
      <DropdownMenuItem
        variant="destructive"
        disabled={pending}
        onClick={onArchive}
      >
        <Archive />
        {kind === "topic" ? t("ui.archiveTopic") : t("ui.archivePrompt")}
      </DropdownMenuItem>
    </RowActionsMenu>
  );
}
