import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QueryState } from "@/client/components/QueryState";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { revalidateLogic } from "@tanstack/react-form";
import { toast } from "sonner";
import { z } from "zod";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { SectionHeader } from "@/client/components/PageHeader";
import { useAppForm } from "@/client/components/form/useAppForm";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { RowActionsMenu } from "@/client/components/RowActionsMenu";
import { DropdownMenuItem } from "@/client/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { CopyButton } from "@/client/components/CopyButton";
import { useOrganizations } from "@/client/features/settings/useOrganizations";
import { captureClientEvent } from "@/client/lib/posthog";
import { authClient } from "@/lib/auth-client";
import { formatUiDate, t } from "@/shared/i18n";

// Better Auth rejects longer names with INVALID_NAME_LENGTH.
const MAX_KEY_NAME_LENGTH = 32;

const createKeySchema = z.object({
  name: z.string().trim().min(1, t("settings.nameRequired")),
});

// Stamped server-side when the key is created (see the /api-key/create hook
// in lib/auth.ts). Older keys were backfilled; only keys whose user had no
// organization at the time have none.
const apiKeyMetadataSchema = z.looseObject({
  organizationId: z.string().optional(),
});

export function ApiKeySettings() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<{ id: string; name: string } | null>(
    null,
  );
  const {
    hasMultiple: showOrganization,
    activeOrganizationName,
    organizationName,
  } = useOrganizations();

  const mcpUrl =
    typeof window === "undefined"
      ? "https://app.openseo.so/mcp"
      : `${window.location.origin}/mcp`;

  const apiKeysQuery = useQuery({
    queryKey: ["apiKeys"],
    queryFn: async () => {
      const result = await authClient.apiKey.list();
      if (result.error) {
        throw new Error(
          result.error.message ?? t("settings.failedLoadApiKeys"),
        );
      }
      return result.data.apiKeys.map((key) => ({
        id: key.id,
        name: key.name,
        start: key.start,
        createdAt: new Date(key.createdAt),
        lastRequest: key.lastRequest ? new Date(key.lastRequest) : null,
        organizationId:
          apiKeyMetadataSchema.safeParse(key.metadata).data?.organizationId ??
          null,
      }));
    },
  });

  const createMutation = useMutation({
    mutationFn: async (keyName: string) => {
      const result = await authClient.apiKey.create({ name: keyName });
      if (result.error || !result.data?.key) {
        throw new Error(result.error?.message ?? t("settings.failedCreateKey"));
      }
      return result.data.key;
    },
    onSuccess: (key) => {
      setCreatedKey(key);
      captureClientEvent("mcp:api_key_created");
      void queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const result = await authClient.apiKey.delete({ keyId });
      if (result.error) {
        throw new Error(result.error.message ?? t("settings.failedRevokeKey"));
      }
    },
    onSuccess: () => {
      captureClientEvent("mcp:api_key_revoked");
      toast.success(t("settings.apiKeyRevoked"));
      setRevoking(null);
      void queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
    },
  });

  const form = useAppForm({
    defaultValues: { name: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: createKeySchema },
    onSubmit: async ({ value }) => {
      await createMutation.mutateAsync(value.name.trim());
    },
  });

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setCreatedKey(null);
    form.reset();
  };

  return (
    <section className="space-y-3">
      <SectionHeader title={t("settings.apiKeys")} />
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm">{t("settings.apiKeysLead")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("settings.apiKeysHermes")}
          </p>
          <p className="mt-1 text-sm">
            <a
              className="text-primary underline-offset-4 hover:underline"
              href="https://openseo.so/docs/mcp"
              target="_blank"
              rel="noreferrer"
            >
              {t("settings.setupGuide")}
            </a>
          </p>
        </div>
        <Button size="sm" onClick={() => setIsCreateOpen(true)}>
          {t("settings.createApiKey")}
        </Button>
      </div>

      <QueryState
        query={apiKeysQuery}
        errorFallback={t("settings.couldNotLoadApiKeys")}
      >
        {(apiKeys) =>
          apiKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("settings.noApiKeysYet")}
            </p>
          ) : (
            <TableCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("settings.colName")}</TableHead>
                    <TableHead>{t("settings.colKey")}</TableHead>
                    {showOrganization ? (
                      <TableHead>{t("settings.colOrganization")}</TableHead>
                    ) : null}
                    <TableHead>{t("settings.colCreated")}</TableHead>
                    <TableHead>{t("settings.colLastUsed")}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiKeys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell className="max-w-[220px] truncate font-medium">
                        {key.name || t("settings.unnamedKey")}
                      </TableCell>
                      <TableCell
                        className="font-mono text-xs text-muted-foreground"
                        data-ph-mask
                      >
                        {key.start || "oseo_"}…
                      </TableCell>
                      {showOrganization ? (
                        <TableCell className="text-xs text-muted-foreground">
                          {organizationName(key.organizationId) ?? "—"}
                        </TableCell>
                      ) : null}
                      <TableCell className="text-xs text-muted-foreground">
                        {formatUiDate(key.createdAt)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {key.lastRequest
                          ? formatUiDate(key.lastRequest)
                          : t("settings.never")}
                      </TableCell>
                      <TableCell>
                        <RowActionsMenu
                          label={t("settings.actionsFor", {
                            name: key.name || t("settings.apiKeys"),
                          })}
                        >
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() =>
                              setRevoking({
                                id: key.id,
                                name: key.name || t("settings.unnamedKey"),
                              })
                            }
                          >
                            <Trash2 />
                            {t("ui.revokeKey")}
                          </DropdownMenuItem>
                        </RowActionsMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          )
        }
      </QueryState>

      {revoking ? (
        <ConfirmDialog
          title={t("settings.revokeKeyTitle", { name: revoking.name })}
          confirmLabel={t("settings.revokeKey")}
          destructive
          pending={revokeMutation.isPending}
          onClose={() => setRevoking(null)}
          onConfirm={() => revokeMutation.mutate(revoking.id)}
        >
          {t("settings.revokeBody")}
        </ConfirmDialog>
      ) : null}

      <Dialog
        open={isCreateOpen}
        // The key is shown once, so only Done closes the reveal step. Escape
        // and an outside click close the name step.
        onOpenChange={(open) => {
          if (!open && createdKey == null) closeCreateModal();
        }}
      >
        <DialogContent
          showCloseButton={false}
          // A minmax(0, 1fr) track, so the long key scrolls in its box and does
          // not push the Copy and Done buttons out of the dialog.
          className="grid-cols-1 sm:max-w-md"
        >
          {createdKey ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("settings.copyNewApiKey")}</DialogTitle>
                <DialogDescription>
                  {t("settings.apiKeyOnce")}{" "}
                  <span className="font-mono text-xs">
                    Authorization: Bearer
                  </span>{" "}
                  {t("settings.apiKeyTo")}{" "}
                  <span className="font-mono text-xs break-all">{mcpUrl}</span>.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2">
                <code
                  className="min-w-0 flex-1 overflow-x-auto rounded bg-muted px-2.5 py-2 font-mono text-xs"
                  data-ph-mask
                >
                  {createdKey}
                </code>
                <CopyButton
                  value={createdKey}
                  successMessage={t("settings.apiKeyCopied")}
                  label={t("settings.copyApiKey")}
                  variant="ghost"
                  size="icon-sm"
                />
              </div>
              <DialogFooter>
                <Button onClick={closeCreateModal}>{t("common.done")}</Button>
              </DialogFooter>
            </>
          ) : (
            <form.AppForm>
              <form.Form className="grid gap-4">
                <DialogHeader>
                  <DialogTitle>{t("settings.createApiKey")}</DialogTitle>
                </DialogHeader>
                <form.AppField name="name">
                  {(field) => (
                    <field.TextField
                      label={t("common.name")}
                      placeholder={t("settings.apiKeyNamePlaceholder")}
                      maxLength={MAX_KEY_NAME_LENGTH}
                      required
                      autoFocus
                    />
                  )}
                </form.AppField>
                {showOrganization ? (
                  <p className="text-sm text-muted-foreground">
                    {t("settings.keyWorksIn", {
                      name: activeOrganizationName ?? "",
                    })}
                  </p>
                ) : null}
                <DialogFooter>
                  <Button variant="ghost" onClick={closeCreateModal}>
                    {t("common.cancel")}
                  </Button>
                  <form.SubmitButton>{t("common.create")}</form.SubmitButton>
                </DialogFooter>
              </form.Form>
            </form.AppForm>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
