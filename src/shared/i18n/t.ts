import { messages, type MessageKey } from "./messages";

export type { MessageKey };

const PLACEHOLDER = /\{([a-zA-Z0-9_]+)\}/g;

/**
 * Look up a Vietnamese UI string. Placeholders use `{name}` and are replaced
 * from `vars`. Unknown keys throw in development so missing copy is obvious.
 */
export function t(
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const template = messages[key];
  if (!vars) return template;
  return template.replace(PLACEHOLDER, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name)
      ? String(vars[name])
      : match,
  );
}
