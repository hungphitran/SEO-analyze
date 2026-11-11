import { useId, useState } from "react";
import { Field, FieldLabel } from "@/client/components/ui/field";
import { Input } from "@/client/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { t } from "@/shared/i18n";

/** Picks a saved topic or names a new one. */
export function TopicField({
  topics,
  value,
  onChange,
}: {
  topics: string[];
  value: string;
  onChange: (topic: string) => void;
}) {
  const topicId = useId();
  // Kept separately so typing a saved topic's name doesn't hide the input.
  const [creating, setCreating] = useState(!topics.includes(value));
  const items = [
    ...topics.map((name) => ({ value: name, label: name })),
    { value: "", label: t("ai.newTopic") },
  ];
  return (
    <>
      {topics.length > 0 && (
        <Field>
          <FieldLabel>{t("ai.topic")}</FieldLabel>
          <Select
            items={items}
            value={creating ? "" : value}
            onValueChange={(name) => {
              setCreating(!name);
              onChange(name ?? "");
            }}
          >
            <SelectTrigger className="w-full" aria-label={t("ai.topic")}>
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
        </Field>
      )}
      {creating && (
        <Field>
          <FieldLabel htmlFor={topicId}>{t("ai.topicName")}</FieldLabel>
          <Input
            id={topicId}
            required
            maxLength={100}
            placeholder={t("ai.egSeoTools")}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      )}
    </>
  );
}
