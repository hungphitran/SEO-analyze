import { useState } from "react";
import { ExternalLink, MessageSquare } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Badge } from "@/client/components/ui/badge";
import { Checkbox } from "@/client/components/ui/checkbox";
import { Input } from "@/client/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { safeHttpUrl } from "@/shared/safe-url";
import { getLocationDisplayName } from "@/shared/keyword-locations";
import type { SerpData } from "@/shared/mcp-contracts";
import type { WidgetHost } from "./useWidgetHost";
import { t } from "@/shared/i18n";

export function SerpWidget({
  host,
  data,
}: {
  host: WidgetHost;
  data: SerpData;
}) {
  const [query, setQuery] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState("");
  const queries = data.results.map((item, index) => ({
    value: index,
    label: `${item.keyword}${item.ok ? "" : " (failed)"} · ${index + 1}`,
  }));
  const result = data.results[query];
  if (!result) return <p>{t("ui.noSearchQueriesWereReturned")}</p>;
  const items = result.ok
    ? result.items.map((item, index) => ({ ...item, index }))
    : [];
  const shown = items.filter((item) =>
    [item.title, item.url, item.description, item.type].some((value) =>
      value?.toLowerCase().includes(filter.toLowerCase()),
    ),
  );
  return (
    <section className="space-y-3">
      <div>
        <h1 className="text-2xl font-semibold">
          {t("ui.googleSearchResults")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("ui.seeWhoRanksAndCompareThe")}
        </p>
      </div>
      {data.results.length > 1 && (
        <div className="space-y-1 text-sm">
          <span>{t("ui.searchQuery")}</span>
          <Select
            items={queries}
            value={query}
            onValueChange={(value) => {
              if (value == null) return;
              setQuery(value);
              setSelected(new Set());
              setFilter("");
            }}
          >
            <SelectTrigger
              aria-label={t("ui.searchQuery")}
              className="w-full bg-card pr-3"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {queries.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {!result.ok ? (
        <div
          role="alert"
          className="space-y-2 rounded-xl border border-border bg-card p-4"
        >
          <h2 className="font-medium">
            {t("ui.couldnTRetrieve", { v0: result.keyword })}
          </h2>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {result.error}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("ui.otherQueriesInThisBatchAre")}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="space-y-2 border-b border-border p-4">
              <h2 className="break-words font-medium">{result.keyword}</h2>
              <p className="text-xs text-muted-foreground">
                {[
                  result.locationName,
                  result.locationCode
                    ? getLocationDisplayName(result.locationCode)
                    : t("ui.projectDefaultMarket"),
                  result.languageCode,
                  result.device ?? "desktop",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <Input
                aria-label={t("ui.filterReturnedSearchResults")}
                className="h-8"
                placeholder={t("ui.filterByPageDomainOrResult")}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead className="w-20 text-center">
                    {t("ui.organic")}
                  </TableHead>
                  <TableHead>{t("ui.page")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((item) => {
                  const url = safeHttpUrl(item.url);
                  return (
                    <TableRow
                      key={item.index}
                      data-state={
                        selected.has(item.index) ? "selected" : undefined
                      }
                    >
                      <TableCell>
                        <Checkbox
                          checked={selected.has(item.index)}
                          aria-label={t("ui.select", {
                            v0: item.title ?? item.type ?? t("ui.resultLower"),
                          })}
                          onCheckedChange={(checked) =>
                            setSelected((current) => {
                              const next = new Set(current);
                              if (checked) next.add(item.index);
                              else next.delete(item.index);
                              return next;
                            })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-center align-middle text-sm tabular-nums text-muted-foreground">
                        {item.organicRank ?? "—"}
                      </TableCell>
                      <TableCell className="min-w-40 space-y-1 whitespace-normal break-words">
                        {item.type !== "organic" && (
                          <Badge variant="secondary">
                            {item.type?.replaceAll("_", " ") ??
                              t("ui.serpFeature")}
                          </Badge>
                        )}
                        {url ? (
                          <button
                            className="flex max-w-full items-start gap-1 text-left font-medium text-primary hover:underline"
                            disabled={host.action.isPending}
                            onClick={() => host.open(url)}
                          >
                            <span className="break-words">
                              {item.title ?? item.url}
                            </span>
                            <ExternalLink className="mt-1 size-3 shrink-0" />
                          </button>
                        ) : item.title ? (
                          <p className="font-medium">{item.title}</p>
                        ) : null}
                        {item.domain && (
                          <p className="break-all text-xs text-muted-foreground">
                            {item.domain}
                          </p>
                        )}
                        {item.description && (
                          <p className="text-sm text-muted-foreground">
                            {item.description}
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {!shown.length && (
              <p className="p-5 text-sm text-muted-foreground">
                {items.length
                  ? t("ui.noReturnedResultsMatchThisFilter")
                  : t("ui.noResultsWereReturnedForThis")}
              </p>
            )}
          </div>
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-auto text-sm">
                {t("ui.selected", { v0: selected.size })}
              </span>
              <Button variant="ghost" onClick={() => setSelected(new Set())}>
                {t("ui.clear")}
              </Button>
              <Button
                disabled={host.action.isPending}
                onClick={() =>
                  host.ask(t("ui.compareTheseSelectedGoogleResultsExplain"), {
                    projectId: host.snapshot?.context.arguments.projectId,
                    keyword: result.keyword,
                    request: host.snapshot?.context.arguments,
                    rows: items.filter((item) => selected.has(item.index)),
                  })
                }
              >
                <MessageSquare />
                {host.clientName
                  ? t("ui.compareIn", { v0: host.clientName })
                  : t("ui.compare")}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
