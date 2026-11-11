import { Check, Pencil, Trash2 } from "lucide-react";
import { DomainFavicon } from "@/client/features/ai-visibility/DomainFavicon";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { TableCell, TableRow } from "@/client/components/ui/table";
import { t } from "@/shared/i18n";

export type WebsiteCompetitor = {
  id: string;
  name: string;
  domain: string;
  notes: string;
};

export function WebsiteCompetitorRow({
  competitor,
  index,
  editing,
  onChange,
  onEdit,
  onRemove,
}: {
  competitor: WebsiteCompetitor;
  index: number;
  editing: boolean;
  onChange: (competitor: WebsiteCompetitor) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <TableRow>
      <TableCell>
        <span className="flex items-center gap-2">
          <DomainFavicon domain={competitor.domain} />
          {editing ? (
            <Input
              autoFocus
              aria-label={t("ui.competitorName", { v0: index + 1 })}
              placeholder={t("ui.competitorName_6cab")}
              required
              maxLength={120}
              value={competitor.name}
              onChange={(event) =>
                onChange({ ...competitor, name: event.target.value })
              }
            />
          ) : (
            <span className="font-medium">{competitor.name}</span>
          )}
        </span>
      </TableCell>
      <TableCell>
        {editing ? (
          <Input
            aria-label={t("ui.competitorWebsite", { v0: index + 1 })}
            placeholder="example.com"
            required
            maxLength={255}
            value={competitor.domain}
            onChange={(event) =>
              onChange({ ...competitor, domain: event.target.value, notes: "" })
            }
          />
        ) : (
          <span className="text-muted-foreground">{competitor.domain}</span>
        )}
      </TableCell>
      <TableCell className="w-20">
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={
              editing ? t("ui.doneEditingCompetitor") : t("ui.edit", { v0: competitor.name })
            }
            disabled={
              editing && (!competitor.name.trim() || !competitor.domain.trim())
            }
            onClick={onEdit}
          >
            {editing ? (
              <Check className="size-4" />
            ) : (
              <Pencil className="size-4" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("ui.remove", { v0: competitor.name || t("ui.competitorNumber", { n: index + 1 }) })}
            onClick={onRemove}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
