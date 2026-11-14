import { lazy, Suspense, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { Map, List } from "lucide-react";
import {
  type LocalPointStatus,
  localPointLabel,
  type LocalGridPoint,
} from "@/shared/local-seo";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardAction,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Skeleton } from "@/client/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { t } from "@/shared/i18n";

const MapView = lazy(() => import("./LocalRankMap"));
export type LocalGridDisplayPoint = LocalGridPoint & {
  id: string;
  status: LocalPointStatus;
  rank: number | null;
  resultsCount: number | null;
};

export function LocalRankGrid({
  projectId,
  points,
  selectedPointId,
  onSelect,
  preview,
}: {
  projectId: string;
  points: LocalGridDisplayPoint[];
  selectedPointId?: string;
  onSelect: (id: string) => void;
  preview: boolean;
}) {
  const [tableView, setTableView] = useState(false);
  return (
    <Card className="h-full min-h-0 min-w-0 gap-0 overflow-hidden py-0 shadow-none">
      <CardHeader className="shrink-0 items-center gap-2 px-4 py-3">
        <CardTitle className="text-sm">
          {preview ? t("local.gridPreview") : t("local.mapsRankings")}
        </CardTitle>
        <CardAction>
          <SegmentedToggle
            showLabels
            items={[
              {
                value: "map",
                icon: <Map className="size-3.5" />,
                label: t("local.map"),
              },
              {
                value: "points",
                icon: <List className="size-3.5" />,
                label: t("local.points"),
              },
            ]}
            value={tableView ? "points" : "map"}
            onChange={(value) => setTableView(value === "points")}
          />
        </CardAction>
      </CardHeader>
      <div className="min-h-0 flex-1 overflow-hidden border-t border-border">
        {tableView ? (
          <div className="h-full overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("local.point")}</TableHead>
                  <TableHead>{t("local.coordinates")}</TableHead>
                  <TableHead>{t("metrics.rank")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {points.map((point) => (
                  <TableRow
                    key={point.id}
                    data-state={
                      point.id === selectedPointId ? "selected" : undefined
                    }
                  >
                    <TableCell>
                      <Button
                        size="sm"
                        variant="link"
                        onClick={() => onSelect(point.id)}
                      >
                        {t("ui.rowCol", {
                          v0: point.row + 1,
                          v1: point.col + 1,
                        })}
                      </Button>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}
                    </TableCell>
                    <TableCell>
                      {preview ? t("rank.notChecked") : localPointLabel(point)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <ClientOnly fallback={<Skeleton className="h-full rounded-none" />}>
            <Suspense fallback={<Skeleton className="h-full rounded-none" />}>
              <MapView
                key={points.map((point) => point.id).join(",")}
                projectId={projectId}
                points={points}
                selectedPointId={selectedPointId}
                onSelect={onSelect}
                preview={preview}
              />
            </Suspense>
          </ClientOnly>
        )}
      </div>
      {!tableView && (
        <div className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <span>
            <span className="mr-1 inline-block size-2 rounded-full bg-green-600" />
            1–3
          </span>
          <span>
            <span className="mr-1 inline-block size-2 rounded-full bg-amber-600" />
            4–10
          </span>
          <span>
            <span className="mr-1 inline-block size-2 rounded-full bg-red-600" />
            11–20
          </span>
          <span>{t("ui.notFound")}</span>
          <span>{t("ui.failed_48ef")}</span>
        </div>
      )}
    </Card>
  );
}
