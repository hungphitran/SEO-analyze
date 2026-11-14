import { Columns3 } from "lucide-react";
import type { VisibilityState } from "@tanstack/react-table";
import { Button } from "@/client/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import {
  DEFAULT_COLUMN_VISIBILITY,
  OPTIONAL_COLUMNS,
} from "@/client/features/audit/results/PagesTableOptionalColumns";
import { t } from "@/shared/i18n";

/** Switches the optional Pages table columns on and off. */
export function ColumnPicker({
  visibility,
  onChange,
}: {
  visibility: VisibilityState;
  onChange: (next: VisibilityState) => void;
}) {
  const shown = OPTIONAL_COLUMNS.filter(
    (column) => visibility[column.id] ?? true,
  ).length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <Columns3 data-icon="inline-start" />
        {t("auditDetail.columnsButton")}
        {shown > 0 ? (
          <span className="tabular-nums text-muted-foreground">+{shown}</span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {t("auditDetail.columnsOptional")}
          </DropdownMenuLabel>
          {OPTIONAL_COLUMNS.map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={visibility[column.id] ?? true}
              onCheckedChange={(checked) =>
                onChange({ ...visibility, [column.id]: checked })
              }
            >
              {column.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onChange(DEFAULT_COLUMN_VISIBILITY)}>
          {t("auditDetail.columnsReset")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
