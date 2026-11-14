import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { t } from "@/shared/i18n";
import type { getSearchInsights } from "@/serverFunctions/searchPerformance";

type Insights = Extract<
  Awaited<ReturnType<typeof getSearchInsights>>,
  { connected: true }
>;

const number = new Intl.NumberFormat("vi-VN");

function pagePath(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

function formatPosition(value: number): string {
  return value > 0 ? value.toFixed(1) : t("gscInsights.noPosition");
}

function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="p-8 text-sm" role="status">
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground">{hint}</p>
    </div>
  );
}

export function CannibalizationTable({
  rows,
}: {
  rows: Insights["cannibalization"];
}) {
  if (rows.length === 0) {
    return (
      <Empty
        title={t("gscInsights.noCannibalization")}
        hint={t("gscInsights.noCannibalizationHint")}
      />
    );
  }
  return (
    <div>
      <p className="px-4 py-3 text-sm text-muted-foreground">
        {t("gscInsights.cannibalizationDesc")}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("gscInsights.colQuery")}</TableHead>
            <TableHead className="text-right">
              {t("gscInsights.colTotalImpressions")}
            </TableHead>
            <TableHead>{t("gscInsights.colPages")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.query}>
              <TableCell className="font-medium">{row.query}</TableCell>
              <TableCell className="text-right tabular-nums">
                {number.format(row.totalImpressions)}
              </TableCell>
              <TableCell>
                <ul className="space-y-1">
                  {row.pages.map((page) => (
                    <li key={page.page} className="text-sm">
                      <span className="break-all">{pagePath(page.page)}</span>
                      <span className="ml-2 text-muted-foreground tabular-nums">
                        {number.format(page.impressions)} ·{" "}
                        {formatPosition(page.position)}
                      </span>
                    </li>
                  ))}
                </ul>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function DecliningPagesTable({ rows }: { rows: Insights["declining"] }) {
  if (rows.length === 0) {
    return (
      <Empty
        title={t("gscInsights.noDeclining")}
        hint={t("gscInsights.noDecliningHint")}
      />
    );
  }
  return (
    <div>
      <p className="px-4 py-3 text-sm text-muted-foreground">
        {t("gscInsights.decliningDesc")}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("gscInsights.colPage")}</TableHead>
            <TableHead className="text-right">
              {t("gscInsights.colClicks")}
            </TableHead>
            <TableHead className="text-right">
              {t("gscInsights.colPrevClicks")}
            </TableHead>
            <TableHead className="text-right">
              {t("gscInsights.colChange")}
            </TableHead>
            <TableHead className="text-right">
              {t("gscInsights.colPosition")}
            </TableHead>
            <TableHead className="text-right">
              {t("gscInsights.colPrevPosition")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.page}>
              <TableCell className="break-all font-medium">
                {pagePath(row.page)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {number.format(row.clicks)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {number.format(row.prevClicks)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-destructive">
                {number.format(row.clicksDelta)} (
                {Math.round(row.clicksChange * 100)}%)
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPosition(row.position)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPosition(row.prevPosition)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
