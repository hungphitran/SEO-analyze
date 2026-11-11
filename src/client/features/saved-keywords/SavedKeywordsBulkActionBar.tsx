import { Copy, FileDown, Sheet, Tags, Trash2 } from "lucide-react";
import {
  TableBulkActionBar,
  TableBulkActionButton,
  TableBulkExportMenu,
} from "@/client/components/table/TableBulkActionBar";
import { t } from "@/shared/i18n";

export function SavedKeywordsBulkActionBar({
  selectedCount,
  onCopy,
  onOpenTags,
  onExportCsv,
  onExportSheets,
  onDelete,
  onClear,
  exportingSelection,
}: {
  selectedCount: number;
  onCopy: () => void;
  onOpenTags: () => void;
  onExportCsv: () => void;
  onExportSheets: () => void;
  onDelete: () => void;
  onClear: () => void;
  exportingSelection: boolean;
}) {
  if (selectedCount === 0) return null;

  return (
    <TableBulkActionBar
      selectedCount={selectedCount}
      onClear={onClear}
      actions={
        <>
          <div className="flex items-center gap-0.5 px-1.5">
            <TableBulkActionButton
              icon={<Tags className="size-3.5" />}
              onClick={onOpenTags}
            >
              {t("ui.tag")}
            </TableBulkActionButton>

            <TableBulkExportMenu
              busy={exportingSelection}
              actions={[
                {
                  label: t("saved.copyKeywords"),
                  icon: <Copy className="size-4" />,
                  onClick: onCopy,
                },
                {
                  label: t("common.exportToSheets"),
                  icon: <Sheet className="size-4" />,
                  onClick: onExportSheets,
                },
                {
                  label: t("common.exportCsv"),
                  icon: <FileDown className="size-4" />,
                  onClick: onExportCsv,
                },
              ]}
            />
          </div>

          <div className="flex items-center border-l border-border px-1.5">
            <TableBulkActionButton
              icon={<Trash2 className="size-3.5" />}
              onClick={onDelete}
              variant="danger"
            >
              {t("common.delete")}
            </TableBulkActionButton>
          </div>
        </>
      }
    />
  );
}
