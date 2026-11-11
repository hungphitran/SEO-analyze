/** Strip secrets from messages that might be logged or shown. */
export function redactSecret(text: string, secret: string | null | undefined) {
  if (!secret) return text;
  return text.split(secret).join("[redacted]");
}

export function redactApiKeyQuery(text: string) {
  return text.replace(/([?&]apikey=)[^&\s"]+/gi, "$1[redacted]");
}

export function safeErrorMessage(
  error: unknown,
  secret?: string | null,
): string {
  const raw = error instanceof Error ? error.message : String(error);
  return redactApiKeyQuery(redactSecret(raw, secret));
}
