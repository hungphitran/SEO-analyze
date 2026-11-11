import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  deleteSavedKeywordTag,
  updateSavedKeywordTag,
} from "@/serverFunctions/keywords";
import type { TagColorKey } from "@/shared/tag-colors";
import { t } from "@/shared/i18n";

export function useTagManage(projectId: string) {
  const queryClient = useQueryClient();
  const [busyTagIds, setBusyTagIds] = useState<Set<string>>(new Set());

  const markBusy = (tagId: string, busy: boolean) => {
    setBusyTagIds((current) => {
      const next = new Set(current);
      if (busy) next.add(tagId);
      else next.delete(tagId);
      return next;
    });
  };

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["savedKeywords", projectId] });

  const updateTag = async (input: {
    tagId: string;
    name?: string;
    color?: TagColorKey | null;
  }) => {
    markBusy(input.tagId, true);
    try {
      await updateSavedKeywordTag({
        data: {
          projectId,
          tagId: input.tagId,
          name: input.name,
          color: input.color ?? undefined,
        },
      });
      await invalidate();
      toast.success(t("saved.tagUpdated"));
    } catch (error) {
      toast.error(getStandardErrorMessage(error, t("saved.couldNotUpdateTag")));
    } finally {
      markBusy(input.tagId, false);
    }
  };

  const deleteTag = async (tagId: string): Promise<boolean> => {
    markBusy(tagId, true);
    try {
      await deleteSavedKeywordTag({ data: { projectId, tagId } });
      await invalidate();
      toast.success(t("saved.tagDeleted"));
      return true;
    } catch (error) {
      toast.error(
        getStandardErrorMessage(
          error,
          t("saved.couldNotDeleteTag"),
        ),
      );
      return false;
    } finally {
      markBusy(tagId, false);
    }
  };

  return { busyTagIds, updateTag, deleteTag };
}
