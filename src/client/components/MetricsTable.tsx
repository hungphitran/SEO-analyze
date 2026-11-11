import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { t } from "@/shared/i18n";

export function MetricsTable({
  rows,
  showChange = false,
}: {
  rows: { label: ReactNode; value: ReactNode; change?: ReactNode }[];
  showChange?: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("ui.metric")}</TableHead>
          <TableHead className="text-right">{t("ui.value")}</TableHead>
          {showChange && <TableHead className="text-right">{t("ui.change")}</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={index}>
            <TableCell>{row.label}</TableCell>
            <TableCell className="text-right tabular-nums">
              {row.value}
            </TableCell>
            {showChange && (
              <TableCell className="text-right tabular-nums">
                {row.change ?? "—"}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function percentChange(
  current: number | null,
  previous: number | null,
): number | null {
  if (current === null || previous === null || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
