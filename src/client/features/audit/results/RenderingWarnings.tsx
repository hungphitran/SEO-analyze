import { ShieldAlert } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/client/components/ui/alert";
import type { AuditResultsData } from "@/client/features/audit/results/types";
import { t } from "@/shared/i18n";

/** Report notices about JavaScript: app shells, and pages a render missed. */
export function RenderingWarnings({ data }: { data: AuditResultsData }) {
  const rendered = data.audit.config.renderJavaScript;
  const hasShells = data.issues.some(
    (issue) => issue.issueType === "javascript-rendering-suspected",
  );
  const unreadCount = data.pages.filter(
    (page) => page.fetchClass === "error",
  ).length;

  return (
    <>
      {hasShells && (
        <Alert variant="warning">
          <ShieldAlert />
          <AlertTitle>{t("audit.somePagesNeedJs")}</AlertTitle>
          <AlertDescription>
            {rendered ? t("audit.stillLoading") : t("audit.turnOnRender")}
          </AlertDescription>
        </Alert>
      )}

      {rendered && unreadCount > 0 && (
        <Alert variant="warning">
          <ShieldAlert />
          <AlertTitle>
            {t("audit.couldNotReadPages", { count: unreadCount })}
          </AlertTitle>
          <AlertDescription>
            {t("audit.openPagesFilterFailed")}
          </AlertDescription>
        </Alert>
      )}

      {rendered && (
        <p className="text-sm text-muted-foreground">
          {t("audit.jsRenderingEnabled")}
        </p>
      )}
    </>
  );
}
