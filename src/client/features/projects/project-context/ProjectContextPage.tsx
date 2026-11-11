import * as React from "react";
import { InlineConfirm } from "@/client/components/InlineConfirm";
import { useQuery } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { QueryState } from "@/client/components/QueryState";
import { getProjectContext } from "@/serverFunctions/projectContext";
import {
  PROJECT_CONTEXT_SECTION_KEYS,
  PROJECT_CONTEXT_SECTION_LABELS,
  PROSE_MAX_CHARS,
  type ProjectContextSectionKey,
} from "@/types/schemas/projectContext";
import { CompetitorsSection } from "./CompetitorsSection";
import { KeyPagesSection } from "./KeyPagesSection";
import {
  listClass,
  Provenance,
  RowActions,
  projectContextQueryKey,
  useContextUpdate,
  type ProjectContextData,
} from "./shared";
import { EmptyState } from "@/client/components/EmptyState";
import { FormActions } from "@/client/components/FormActions";
import { SectionHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Textarea } from "@/client/components/ui/textarea";
import { t } from "@/shared/i18n";

const SECTION_HINTS: Record<ProjectContextSectionKey, string> = {
  business_overview: t("context.offerHint"),
  current_goal: t("context.goalsHint"),
  positioning: t("context.positioningHint"),
  writing_preferences: t("context.writingHint"),
};

const SECTION_PLACEHOLDERS: Record<ProjectContextSectionKey, string> = {
  business_overview:
    t("ui.eGBookingSoftwareForIndependent"),
  current_goal:
    t("ui.eGDoubleOrganicSignupsBy"),
  positioning:
    t("ui.eGTheOnlyBookingTool"),
  writing_preferences:
    t("ui.eGPlainAndDirectNo"),
};

export function ProjectContextPage({ projectId }: { projectId: string }) {
  const contextQuery = useQuery({
    queryKey: projectContextQueryKey(projectId),
    queryFn: () => getProjectContext({ data: { projectId } }),
    // This page exists to inspect what agents just wrote; the app-wide
    // 5-minute staleTime would show pre-SAM-turn memory as current.
    staleTime: 0,
  });

  return (
    <QueryState
      query={contextQuery}
      errorFallback={t("context.failedLoad")}
    >
      {(context) => (
        // key remounts the whole page when the project switches under it, so no
        // draft, open form, or edit state can carry over to another project.
        <div key={projectId} className="space-y-8">
          <p className="text-sm text-muted-foreground">
            {t("ui.whatClaudeCodeAndAnyOther")}
          </p>

          <ProseSections
            projectId={projectId}
            sections={context.sections}
            missingSections={context.missingSections}
          />

          <CompetitorsSection
            projectId={projectId}
            competitors={context.competitors}
          />

          <KeyPagesSection projectId={projectId} keyPages={context.keyPages} />

          <CustomSections
            projectId={projectId}
            customSections={context.customSections}
          />

          <ResearchLog
            projectId={projectId}
            researchLog={context.researchLog}
          />
        </div>
      )}
    </QueryState>
  );
}

function ProseSections({
  projectId,
  sections,
  missingSections,
}: {
  projectId: string;
  sections: ProjectContextData["sections"];
  missingSections: ProjectContextData["missingSections"];
}) {
  const update = useContextUpdate(projectId);
  const stored = new Map(sections.map((section) => [section.key, section]));
  // Only the fields the user actually touched are pinned locally; the rest
  // render straight from the query, so a write from SAM shows up on refetch.
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});

  const draftOf = (key: ProjectContextSectionKey) =>
    drafts[key] ?? stored.get(key)?.content ?? "";

  // Content is trimmed server-side, so compare trimmed values — otherwise a
  // stray newline leaves the form permanently "unsaved".
  const changed = PROJECT_CONTEXT_SECTION_KEYS.filter(
    (key) => draftOf(key).trim() !== (stored.get(key)?.content ?? ""),
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (update.isPending || changed.length === 0) return;
    update.mutate(
      changed.map((key) => ({ section: key, content: draftOf(key).trim() })),
      // Unpin every draft the save made redundant — one that now matches the
      // server — so those sections render from the query again (a pinned
      // draft would silently overwrite a later agent write on the next
      // save). Anything typed while the request was in flight still differs
      // and stays pinned instead of snapping back.
      {
        onSuccess: (context) => {
          const saved = new Map<string, string>(
            context.sections.map((section) => [section.key, section.content]),
          );
          setDrafts((current) =>
            Object.fromEntries(
              Object.entries(current).filter(
                ([key, value]) => value.trim() !== (saved.get(key) ?? ""),
              ),
            ),
          );
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {missingSections.length === PROJECT_CONTEXT_SECTION_KEYS.length ? (
        <EmptyState
          size="sm"
          icon={null}
          title={t("context.nothingWritten")}
          description={t("context.fillHint")}
        />
      ) : null}

      {PROJECT_CONTEXT_SECTION_KEYS.map((key) => {
        const section = stored.get(key);
        return (
          <div key={key} className="space-y-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <label
                htmlFor={`context-${key}`}
                className="text-sm font-medium text-foreground"
              >
                {PROJECT_CONTEXT_SECTION_LABELS[key]}
              </label>
              {section ? (
                <Provenance by={section.updatedBy} at={section.updatedAt} />
              ) : (
                <span className="text-xs text-muted-foreground">{t("context.empty")}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {SECTION_HINTS[key]}
            </p>
            <Textarea
              id={`context-${key}`}
              value={draftOf(key)}
              onChange={(event) => {
                const value = event.target.value;
                setDrafts((current) => {
                  // A draft that matches the store is no draft at all — drop
                  // it so an edit typed and then undone doesn't pin the
                  // section against later agent writes.
                  if (value === (stored.get(key)?.content ?? "")) {
                    const { [key]: _dropped, ...rest } = current;
                    return rest;
                  }
                  return { ...current, [key]: value };
                });
              }}
              rows={4}
              maxLength={PROSE_MAX_CHARS}
              placeholder={SECTION_PLACEHOLDERS[key]}
            />
          </div>
        );
      })}

      <div className="flex justify-end">
        <Button
          type="submit"
          size="sm"
          disabled={update.isPending || changed.length === 0}
        >
          {t("ui.saveChanges")}
        </Button>
      </div>
    </form>
  );
}

function CustomSections({
  projectId,
  customSections,
}: {
  projectId: string;
  customSections: ProjectContextData["customSections"];
}) {
  const update = useContextUpdate(projectId);
  const [editingSlug, setEditingSlug] = React.useState<string | null>(null);

  return (
    <section className="space-y-3">
      <SectionHeader
        title={t("context.customSections")}
        hint={t("context.customEmptyHelp")}
      />

      {customSections.length === 0 ? (
        <EmptyState
          size="sm"
          icon={null}
          title={t("context.nothingHere")}
          description={t("context.customHint")}
        />
      ) : (
        <div className="space-y-3">
          {customSections.map((custom) =>
            editingSlug === custom.slug ? (
              <CustomSectionForm
                key={custom.slug}
                custom={custom}
                pending={update.isPending}
                onCancel={() => setEditingSlug(null)}
                onSave={(title, content) =>
                  update.mutate(
                    [{ customSection: custom.slug, title, content }],
                    { onSuccess: () => setEditingSlug(null) },
                  )
                }
              />
            ) : (
              <div
                key={custom.slug}
                className="space-y-2 rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium">
                      {custom.title ?? custom.slug}
                    </h3>
                    <Provenance by={custom.updatedBy} at={custom.updatedAt} />
                  </div>
                  <RowActions>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t("ui.edit", { v0: custom.title ?? custom.slug })}
                      onClick={() => setEditingSlug(custom.slug)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <InlineConfirm
                      label={t("ui.delete", { v0: custom.title ?? custom.slug })}
                      pending={update.isPending}
                      onConfirm={() =>
                        update.mutate([{ deleteCustomSection: custom.slug }])
                      }
                    />
                  </RowActions>
                </div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {custom.content}
                </p>
              </div>
            ),
          )}
        </div>
      )}
    </section>
  );
}

function CustomSectionForm({
  custom,
  pending,
  onCancel,
  onSave,
}: {
  custom: ProjectContextData["customSections"][number];
  pending: boolean;
  onCancel: () => void;
  onSave: (title: string, content: string) => void;
}) {
  const [title, setTitle] = React.useState(custom.title ?? "");
  const [content, setContent] = React.useState(custom.content);

  return (
    <form
      className="space-y-2 rounded-lg border border-border bg-muted/40 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || !content.trim()) return;
        onSave(title.trim() || custom.slug, content);
      }}
    >
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={custom.slug}
        maxLength={120}
        aria-label={t("context.sectionTitle")}
      />
      <Textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={5}
        maxLength={PROSE_MAX_CHARS}
        aria-label={t("context.sectionContent")}
      />
      <FormActions
        pending={pending}
        disabled={!content.trim()}
        onCancel={onCancel}
        size="xs"
      />
    </form>
  );
}

function ResearchLog({
  projectId,
  researchLog,
}: {
  projectId: string;
  researchLog: ProjectContextData["researchLog"];
}) {
  const update = useContextUpdate(projectId);

  return (
    <section className="space-y-3">
      <SectionHeader
        title={t("context.researchLog")}
        hint={t("context.researchEmptyHelp")}
      />

      {researchLog.length === 0 ? (
        <EmptyState
          size="sm"
          icon={null}
          title={t("context.nothingLogged")}
          description={t("context.researchLogHint")}
        />
      ) : (
        <ul className={listClass}>
          {researchLog.map((entry) => (
            <li
              key={entry.id}
              className="flex items-start justify-between gap-3 p-3"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm text-foreground">{entry.summary}</p>
                <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                  <span>{entry.entryDate}</span>
                  <Provenance by={entry.createdBy} />
                </div>
              </div>
              <RowActions>
                <InlineConfirm
                  label={t("ui.deleteLogEntryFrom", { v0: entry.entryDate })}
                  pending={update.isPending}
                  onConfirm={() =>
                    update.mutate([{ removeResearchLog: [entry.id] }])
                  }
                />
              </RowActions>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
