import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { getCruxVitalsFn } from "@/serverFunctions/free-sources";
import { t, type MessageKey } from "@/shared/i18n";
import {
  CRUX_FORM_FACTORS,
  CRUX_METRIC_KEYS,
  formatCruxValue,
  rateCruxMetric,
  type CruxFormFactor,
  type CruxMetricKey,
  type CruxRating,
  type CruxTargetResult,
  type CruxTrend,
} from "@/shared/real-user-signals";

const FORM_FACTOR_LABELS: Record<CruxFormFactor, MessageKey> = {
  ALL: "crux.formAll",
  PHONE: "crux.formPhone",
  DESKTOP: "crux.formDesktop",
};

const METRIC_LABELS: Record<CruxMetricKey, MessageKey> = {
  lcp: "crux.metric.lcp",
  inp: "crux.metric.inp",
  cls: "crux.metric.cls",
  fcp: "crux.metric.fcp",
  ttfb: "crux.metric.ttfb",
};

const RATING_LABELS: Record<CruxRating, MessageKey> = {
  good: "crux.rating.good",
  "needs-improvement": "crux.rating.needs-improvement",
  poor: "crux.rating.poor",
};

const RATING_CLASSES: Record<CruxRating, string> = {
  good: "text-success",
  "needs-improvement": "text-warning-foreground dark:text-warning",
  poor: "text-destructive",
};

function percent(value: number | null): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

/** Tiny inline p75 trend line; gaps (null weeks) break the line. */
function Sparkline({ values }: { values: (number | null)[] }) {
  const numeric = values.filter((value): value is number => value != null);
  if (numeric.length < 2) {
    return <span className="text-muted-foreground">—</span>;
  }
  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  const width = 96;
  const height = 24;
  const span = max - min || 1;
  const step = width / (values.length - 1);
  let path = "";
  let pen = false;
  values.forEach((value, index) => {
    if (value == null) {
      pen = false;
      return;
    }
    const x = (index * step).toFixed(1);
    const y = (height - 2 - ((value - min) / span) * (height - 4)).toFixed(1);
    path += `${pen ? "L" : "M"}${x} ${y} `;
    pen = true;
  });
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={t("crux.column.trend")}
      className="text-primary"
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function DistributionBar({
  good,
  needsImprovement,
  poor,
}: {
  good: number | null;
  needsImprovement: number | null;
  poor: number | null;
}) {
  if (good == null) return <span className="text-muted-foreground">—</span>;
  const parts = [
    { value: good, className: "bg-success" },
    { value: needsImprovement ?? 0, className: "bg-warning" },
    { value: poor ?? 0, className: "bg-destructive" },
  ];
  return (
    <div className="space-y-1">
      <div className="flex h-2 w-32 overflow-hidden rounded-full bg-muted">
        {parts.map((part, index) => (
          <div
            key={index}
            className={part.className}
            style={{ width: `${Math.max(0, part.value) * 100}%` }}
          />
        ))}
      </div>
      <div className="text-muted-foreground text-xs tabular-nums">
        {percent(good)} / {percent(needsImprovement)} / {percent(poor)}
      </div>
    </div>
  );
}

function trendFor(trend: CruxTrend | null, key: CruxMetricKey) {
  return trend?.metrics[key]?.p75s ?? null;
}

function TargetTable({ result }: { result: CruxTargetResult }) {
  if (result.status === "no_data") {
    return (
      <p className="text-muted-foreground">
        {t("crux.noData", { target: result.target })}
      </p>
    );
  }
  if (result.status === "error") {
    return (
      <p className="text-muted-foreground">
        {t("crux.targetError", {
          target: result.target,
          message: result.message,
        })}
      </p>
    );
  }
  const { record, trend } = result;
  const weeks = trend?.dates.length ?? 0;
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-muted-foreground text-xs">
            <tr>
              <th className="py-1 pr-3 font-medium">
                {t("crux.column.metric")}
              </th>
              <th className="py-1 pr-3 text-right font-medium">
                {t("crux.column.p75")}
              </th>
              <th className="py-1 pr-3 font-medium">
                {t("crux.column.share")}
              </th>
              <th className="py-1 font-medium">{t("crux.column.trend")}</th>
            </tr>
          </thead>
          <tbody>
            {CRUX_METRIC_KEYS.filter((key) => record.metrics[key]).map(
              (key) => {
                const metric = record.metrics[key]!;
                const rating = rateCruxMetric(key, metric.p75);
                return (
                  <tr key={key} className="border-t border-border/60">
                    <td className="py-1.5 pr-3">{t(METRIC_LABELS[key])}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      <span className="font-medium">
                        {formatCruxValue(key, metric.p75)}
                      </span>
                      {rating ? (
                        <span
                          className={`ml-2 text-xs ${RATING_CLASSES[rating]}`}
                        >
                          {t(RATING_LABELS[rating])}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-3">
                      <DistributionBar
                        good={metric.good}
                        needsImprovement={metric.needsImprovement}
                        poor={metric.poor}
                      />
                    </td>
                    <td className="py-1.5">
                      {trendFor(trend, key) ? (
                        <Sparkline values={trendFor(trend, key)!} />
                      ) : (
                        <span className="text-muted-foreground">
                          {t("crux.trendNone")}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              },
            )}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">
        {record.periodStart && record.periodEnd
          ? t("crux.period", {
              start: record.periodStart,
              end: record.periodEnd,
            })
          : null}
        {weeks > 1 ? ` · ${t("crux.trend", { weeks })}` : null}
      </p>
    </div>
  );
}

/**
 * Real-user Core Web Vitals (Chrome UX Report), shown beside PageSpeed Insights.
 * Renders nothing unless the server has a CrUX-capable key, so an unconfigured
 * deployment shows no broken UI.
 */
export function CruxVitalsPanel({ projectId }: { projectId: string }) {
  const [formFactor, setFormFactor] = useState<CruxFormFactor>("ALL");
  const query = useQuery({
    queryKey: ["crux-vitals", projectId, formFactor],
    queryFn: () => getCruxVitalsFn({ data: { projectId, formFactor } }),
    staleTime: 10 * 60_000,
  });

  if (query.isError) {
    return (
      <QueryError
        error={query.error}
        fallback={t("crux.loadFailed")}
        onRetry={() => {
          void query.refetch();
        }}
        isRetrying={query.isFetching}
        variant="inline"
      />
    );
  }
  const data = query.data;
  if (!data || data.state === "disabled") return null;
  if (data.state === "no_website") {
    return <p className="text-muted-foreground">{t("crux.noWebsite")}</p>;
  }
  if (data.state === "api_not_enabled") {
    return <p className="text-muted-foreground">{t("crux.apiNotEnabled")}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">{t("crux.title")}</h3>
        <div className="flex gap-1">
          {CRUX_FORM_FACTORS.map((ff) => (
            <Button
              key={ff}
              size="sm"
              variant={ff === formFactor ? "secondary" : "outline"}
              aria-pressed={ff === formFactor}
              onClick={() => setFormFactor(ff)}
            >
              {t(FORM_FACTOR_LABELS[ff])}
            </Button>
          ))}
        </div>
      </div>
      <p className="text-muted-foreground">{t("crux.desc")}</p>
      <div className="space-y-1">
        <strong>{t("crux.origin")}</strong>
        <TargetTable result={data.origin} />
      </div>
      {data.url ? (
        <div className="space-y-1">
          <strong>{t("crux.url")}</strong>
          <TargetTable result={data.url} />
        </div>
      ) : null}
    </div>
  );
}
