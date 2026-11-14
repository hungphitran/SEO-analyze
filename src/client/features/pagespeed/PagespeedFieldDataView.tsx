import {
  DistributionBar,
  METRIC_LABELS,
  RATING_CLASSES,
  RATING_LABELS,
} from "@/client/features/integrations/CruxVitalsPanel";
import { t, type MessageKey } from "@/shared/i18n";
import type {
  PagespeedFieldBlock,
  PagespeedFieldData,
} from "@/shared/pagespeed-detail";
import {
  CRUX_METRIC_KEYS,
  formatCruxValue,
  rateCruxMetric,
} from "@/shared/real-user-signals";

const OVERALL_LABELS: Record<
  NonNullable<PagespeedFieldBlock["overall"]>,
  MessageKey
> = {
  FAST: "psi.overall.FAST",
  AVERAGE: "psi.overall.AVERAGE",
  SLOW: "psi.overall.SLOW",
};

function FieldBlockTable({
  title,
  block,
}: {
  title: string;
  block: PagespeedFieldBlock | null;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm">
        <strong>{title}</strong>
        {block?.overall ? (
          <span className="ml-2 text-muted-foreground text-xs">
            {t("psi.overallLabel", { value: t(OVERALL_LABELS[block.overall]) })}
          </span>
        ) : null}
      </p>
      {!block ? (
        <p className="text-muted-foreground text-sm">{t("psi.fieldNoneFor")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground text-xs">
              <tr>
                <th className="py-1 pr-3 font-medium">
                  {t("crux.column.metric")}
                </th>
                <th className="py-1 pr-3 text-right font-medium">
                  {t("crux.column.p75")}
                </th>
                <th className="py-1 font-medium">{t("crux.column.share")}</th>
              </tr>
            </thead>
            <tbody>
              {CRUX_METRIC_KEYS.filter((key) => block.metrics[key]).map(
                (key) => {
                  const metric = block.metrics[key];
                  if (!metric) return null;
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
                      <td className="py-1.5">
                        <DistributionBar
                          good={metric.good}
                          needsImprovement={metric.needsImprovement}
                          poor={metric.poor}
                        />
                      </td>
                    </tr>
                  );
                },
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Real-user (CrUX) data that PageSpeed returned with a run: the tested URL and
 * its whole origin. Empty when Google has too little traffic for either.
 */
export function PagespeedFieldDataView({
  data,
}: {
  data: PagespeedFieldData | null | undefined;
}) {
  return (
    <section className="space-y-2">
      <h4 className="font-medium text-sm">{t("psi.fieldTitle")}</h4>
      {!data || (!data.url && !data.origin) ? (
        <p className="text-muted-foreground text-sm">{t("psi.fieldNone")}</p>
      ) : (
        <div className="space-y-4">
          <FieldBlockTable title={t("psi.fieldUrl")} block={data.url} />
          <FieldBlockTable title={t("psi.fieldOrigin")} block={data.origin} />
          <p className="text-muted-foreground text-xs">{t("psi.fieldNote")}</p>
        </div>
      )}
    </section>
  );
}
