import * as React from "react";
import { Input } from "@/client/components/ui/input";
import { FormActions } from "@/client/components/FormActions";
import type { ProjectContextUpdate } from "@/types/schemas/projectContext";
import { EditableListSection } from "./EditableListSection";
import { Provenance, useContextUpdate, type ContextCompetitor } from "./shared";
import { t } from "@/shared/i18n";

type CompetitorDraft = { domain: string; name: string; notes: string };

export function CompetitorsSection({
  projectId,
  competitors,
}: {
  projectId: string;
  competitors: ContextCompetitor[];
}) {
  const update = useContextUpdate(projectId);

  const save = (
    previousDomain: string | null,
    draft: CompetitorDraft,
    close: () => void,
  ) => {
    const ops: ProjectContextUpdate[] = [];
    if (previousDomain && previousDomain !== draft.domain.trim()) {
      ops.push({ removeCompetitors: [previousDomain] });
    }
    // Blank values clear stored fields. Omission would preserve agent writes.
    ops.push({
      addCompetitors: [
        {
          domain: draft.domain.trim(),
          name: draft.name.trim(),
          notes: draft.notes.trim(),
        },
      ],
    });
    update.mutate(ops, { onSuccess: close });
  };

  return (
    <EditableListSection
      title={t("context.competitors")}
      hint={t("context.competitorsHelp")}
      addLabel={t("context.addCompetitor")}
      emptyTitle={t("context.noCompetitors")}
      emptyDescription={t("context.noCompetitorsHint")}
      items={competitors}
      getId={(item) => item.id}
      getLabel={(item) => item.domain}
      pending={update.isPending}
      onRemove={(item) => update.mutate([{ removeCompetitors: [item.domain] }])}
      renderItem={(item) => (
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate text-sm font-medium">{item.domain}</span>
            {item.name ? (
              <span className="truncate text-xs text-muted-foreground">
                {item.name}
              </span>
            ) : null}
          </div>
          {item.notes ? (
            <p className="text-sm text-muted-foreground">{item.notes}</p>
          ) : null}
          <Provenance by={item.updatedBy} at={item.updatedAt} />
        </div>
      )}
      renderForm={(item, close) => (
        <CompetitorForm
          initial={item}
          pending={update.isPending}
          onCancel={close}
          onSave={(draft) => save(item?.domain ?? null, draft, close)}
        />
      )}
    />
  );
}

function CompetitorForm({
  initial,
  pending,
  onCancel,
  onSave,
}: {
  initial?: ContextCompetitor;
  pending: boolean;
  onCancel: () => void;
  onSave: (draft: CompetitorDraft) => void;
}) {
  const [draft, setDraft] = React.useState<CompetitorDraft>({
    domain: initial?.domain ?? "",
    name: initial?.name ?? "",
    notes: initial?.notes ?? "",
  });

  return (
    <form
      className="space-y-2 bg-muted/40 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!draft.domain.trim() || pending) return;
        onSave(draft);
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          autoFocus
          value={draft.domain}
          onChange={(event) =>
            setDraft({ ...draft, domain: event.target.value })
          }
          placeholder="competitor.com"
          maxLength={255}
          aria-label={t("context.competitorDomain")}
        />
        <Input
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          placeholder={t("context.nameOptional")}
          maxLength={120}
          aria-label={t("context.competitorName")}
        />
      </div>
      <Input
        value={draft.notes}
        onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
        placeholder={t("context.competitorNotesPlaceholder")}
        maxLength={500}
        aria-label={t("context.competitorNotes")}
      />
      <FormActions
        pending={pending}
        disabled={!draft.domain.trim()}
        onCancel={onCancel}
        size="xs"
      />
    </form>
  );
}
