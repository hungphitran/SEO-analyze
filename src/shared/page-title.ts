import { t, type MessageKey } from "@/shared/i18n";

const APP_NAME = "OpenSEO";

/** "Tổng quan · OpenSEO" — the browser-tab title for one page. */
export function pageTitle(label: string): string {
  return `${label} · ${APP_NAME}`;
}

/** TanStack Router `head` option that sets only the page title. */
export function pageHead(key: MessageKey) {
  return () => ({ meta: [{ title: pageTitle(t(key)) }] });
}
