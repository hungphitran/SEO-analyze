import { Button } from "@/client/components/ui/button";
import { t } from "@/shared/i18n";

export function GoogleConnectedState({
  property,
  detail,
  email,
  onChange,
  onDisconnect,
  disconnecting,
  canManage,
  canManageAccounts,
  disabled,
}: {
  property: string;
  detail?: string | null;
  email?: string | null;
  onChange: () => void;
  onDisconnect: () => void;
  disconnecting: boolean;
  canManage: boolean;
  canManageAccounts: boolean;
  disabled: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <p className="break-words text-sm font-semibold">
          {property || detail}
        </p>
        {detail ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("integrations.propertyId", {
              id: detail.replace(/^properties\//, ""),
            })}
          </p>
        ) : null}
        {email ? (
          <p className="mt-1 break-all text-sm text-muted-foreground">
            {email}
          </p>
        ) : null}
      </div>
      {canManage || canManageAccounts ? (
        <fieldset
          disabled={disconnecting || disabled}
          className="flex flex-wrap items-center gap-1"
        >
          <Button variant="outline" size="sm" onClick={onChange}>
            {canManage
              ? t("integrations.changePropertyOrAccount")
              : t("integrations.manageGoogleAccounts")}
          </Button>
          {canManage ? (
            <Button variant="destructive" size="sm" onClick={onDisconnect}>
              {disconnecting
                ? t("common.disconnecting")
                : t("integrations.disconnectProject")}
            </Button>
          ) : null}
        </fieldset>
      ) : null}
    </div>
  );
}
