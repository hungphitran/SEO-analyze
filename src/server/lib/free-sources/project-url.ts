/**
 * Build the HTTPS website URL for a project's stored domain (a bare host).
 * Returns null when the value is missing or is not a hostname, so we never
 * invent a site or send PageSpeed a guessed address.
 */
export function projectWebsiteUrlFromDomain(
  domain: string | null | undefined,
): string | null {
  const host = domain?.trim().toLowerCase();
  if (!host) return null;
  if (host.includes("/") || host.includes(":") || host.includes("@")) {
    return null;
  }
  try {
    const url = new URL(`https://${host}`);
    if (url.username || url.password || url.port) return null;
    if (!url.hostname) return null;
    return `https://${url.hostname}`;
  } catch {
    return null;
  }
}
