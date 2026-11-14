import type { ReactNode } from "react";
import {
  DataTableFilterGroup,
  DataTableFilterPanel,
  DataTableFilterToggle,
  DataTableRangeFilter,
  DataTableToolbar,
} from "@/client/components/table/DataTableToolbar";
import { Input } from "@/client/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import type {
  PagesFilters,
  PerformanceFilters,
} from "@/client/features/audit/results/AuditResultsTableFilterLogic";
import { t } from "@/shared/i18n";

export function PagesFilterBar({
  filters,
  onChange,
  activeFilterCount,
  onReset,
}: {
  filters: PagesFilters;
  onChange: (filters: PagesFilters) => void;
  activeFilterCount: number;
  onReset: () => void;
}) {
  return (
    <DataTableFilterPanel activeCount={activeFilterCount} onReset={onReset}>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <TextFilter
          label={t("common.search")}
          value={filters.query}
          placeholder={t("audit.urlTitleMeta")}
          onChange={(query) => onChange({ ...filters, query })}
        />
        <SelectFilter
          label={t("audit.status")}
          value={filters.status}
          onChange={(status) => onChange({ ...filters, status })}
          options={[
            ["all", t("common.all")],
            ["ok", "2xx"],
            ["redirect", "3xx"],
            ["error", "4xx/5xx"],
            ["missing", t("audit.filterMissing")],
          ]}
        />
        <SelectFilter
          label={t("audit.crawlResult")}
          value={filters.fetchClass}
          onChange={(fetchClass) => onChange({ ...filters, fetchClass })}
          options={[
            ["all", t("common.all")],
            ["ok", t("audit.filterRead")],
            ["error", t("common.failed")],
            ["blocked", t("audit.filterBlocked")],
            ["rate_limited", t("audit.rateLimited")],
          ]}
        />
        <SelectFilter
          label={t("audit.altText")}
          value={filters.missingAlt}
          onChange={(missingAlt) => onChange({ ...filters, missingAlt })}
          options={[
            ["all", t("common.all")],
            ["yes", t("audit.missingAlt")],
            ["no", t("audit.noMissingAlt")],
          ]}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        <SelectFilter
          label={t("auditDetail.filterHasIssues")}
          value={filters.hasIssues}
          onChange={(hasIssues) => onChange({ ...filters, hasIssues })}
          options={[
            ["all", t("common.all")],
            ["yes", t("auditDetail.filterWithIssues")],
            ["no", t("auditDetail.filterNoIssues")],
          ]}
        />
        <SelectFilter
          label={t("auditDetail.filterNoindex")}
          value={filters.noindex}
          onChange={(noindex) => onChange({ ...filters, noindex })}
          options={[
            ["all", t("common.all")],
            ["yes", t("auditDetail.filterOnlyNoindex")],
          ]}
        />
        <SelectFilter
          label={t("auditDetail.filterCanonical")}
          value={filters.canonicalDiffers}
          onChange={(canonicalDiffers) =>
            onChange({ ...filters, canonicalDiffers })
          }
          options={[
            ["all", t("common.all")],
            ["yes", t("auditDetail.filterCanonicalDiffers")],
          ]}
        />
        <SelectFilter
          label={t("auditDetail.filterMetaDescription")}
          value={filters.missingMeta}
          onChange={(missingMeta) => onChange({ ...filters, missingMeta })}
          options={[
            ["all", t("common.all")],
            ["yes", t("auditDetail.filterMetaMissing")],
          ]}
        />
        <SelectFilter
          label={t("auditDetail.filterOg")}
          value={filters.missingOg}
          onChange={(missingOg) => onChange({ ...filters, missingOg })}
          options={[
            ["all", t("common.all")],
            ["yes", t("auditDetail.filterOgMissing")],
          ]}
        />
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <RangeFilter
          label={t("audit.words")}
          min={filters.minWords}
          max={filters.maxWords}
          onMinChange={(minWords) => onChange({ ...filters, minWords })}
          onMaxChange={(maxWords) => onChange({ ...filters, maxWords })}
        />
        <RangeFilter
          label={t("audit.speedMs")}
          min={filters.minResponseMs}
          max={filters.maxResponseMs}
          onMinChange={(minResponseMs) =>
            onChange({ ...filters, minResponseMs })
          }
          onMaxChange={(maxResponseMs) =>
            onChange({ ...filters, maxResponseMs })
          }
        />
      </div>
    </DataTableFilterPanel>
  );
}

export function PerformanceFilterBar({
  filters,
  onChange,
  activeFilterCount,
  onReset,
}: {
  filters: PerformanceFilters;
  onChange: (filters: PerformanceFilters) => void;
  activeFilterCount: number;
  onReset: () => void;
}) {
  return (
    <DataTableFilterPanel activeCount={activeFilterCount} onReset={onReset}>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <TextFilter
          label={t("common.search")}
          value={filters.query}
          placeholder="URL"
          onChange={(query) => onChange({ ...filters, query })}
        />
        <SelectFilter
          label={t("common.device")}
          value={filters.device}
          onChange={(device) => onChange({ ...filters, device })}
          options={[
            ["all", t("common.all")],
            ["desktop", t("common.desktop")],
            ["mobile", t("common.mobile")],
          ]}
        />
        <SelectFilter
          label={t("audit.status")}
          value={filters.status}
          onChange={(status) => onChange({ ...filters, status })}
          options={[
            ["all", t("common.all")],
            ["ok", "OK"],
            ["failed", t("common.failed")],
          ]}
        />
        <TextFilter
          label={t("audit.maxLcp")}
          value={filters.maxLcpSeconds}
          placeholder="2.5"
          type="number"
          onChange={(maxLcpSeconds) => onChange({ ...filters, maxLcpSeconds })}
        />
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <RangeFilter
          label={t("audit.perfShort")}
          min={filters.minPerf}
          max={filters.maxPerf}
          onMinChange={(minPerf) => onChange({ ...filters, minPerf })}
          onMaxChange={(maxPerf) => onChange({ ...filters, maxPerf })}
        />
        <RangeFilter
          label="SEO"
          min={filters.minSeo}
          max={filters.maxSeo}
          onMinChange={(minSeo) => onChange({ ...filters, minSeo })}
          onMaxChange={(maxSeo) => onChange({ ...filters, maxSeo })}
        />
      </div>
    </DataTableFilterPanel>
  );
}

/** The toolbar above a results table: the filter toggle and the row count. */
export function ResultsTableToolbar({
  showFilters,
  onToggle,
  activeFilterCount,
  resultCount,
  totalCount,
  actions,
}: {
  showFilters: boolean;
  onToggle: () => void;
  activeFilterCount: number;
  resultCount: number;
  totalCount: number;
  /** Extra controls (for example the column picker) beside the row count. */
  actions?: ReactNode;
}) {
  return (
    <DataTableToolbar
      actions={
        <div className="flex items-center gap-3">
          {actions}
          <span className="text-sm tabular-nums text-muted-foreground">
            {resultCount.toLocaleString()} {t("ui.of")}{" "}
            {totalCount.toLocaleString()}
          </span>
        </div>
      }
    >
      <DataTableFilterToggle
        open={showFilters}
        activeCount={activeFilterCount}
        onToggle={onToggle}
      />
    </DataTableToolbar>
  );
}

export function countActiveFilters<TFilters extends Record<string, string>>(
  filters: TFilters,
  emptyFilters: TFilters,
) {
  return Object.keys(filters).reduce((count, key) => {
    const filterKey = key as keyof TFilters;
    return filters[filterKey] !== emptyFilters[filterKey] ? count + 1 : count;
  }, 0);
}

function TextFilter({
  label,
  value,
  placeholder,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  type?: "text" | "number";
  onChange: (value: string) => void;
}) {
  return (
    <DataTableFilterGroup label={label}>
      <Input
        aria-label={label}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </DataTableFilterGroup>
  );
}

function RangeFilter({
  label,
  min,
  max,
  onMinChange,
  onMaxChange,
}: {
  label: string;
  min: string;
  max: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
}) {
  return (
    <DataTableRangeFilter
      label={label}
      min={{ value: min, onChange: (event) => onMinChange(event.target.value) }}
      max={{ value: max, onChange: (event) => onMaxChange(event.target.value) }}
    />
  );
}

function SelectFilter<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
}) {
  const items = options.map(([optionValue, optionLabel]) => ({
    value: optionValue,
    label: optionLabel,
  }));
  return (
    <DataTableFilterGroup label={label}>
      <Select
        items={items}
        value={value}
        onValueChange={(next) => {
          if (next !== null) onChange(next);
        }}
      >
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </DataTableFilterGroup>
  );
}
