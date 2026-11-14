import { BingWebmasterConnectionRepository } from "@/server/features/free-sources/repositories/BingWebmasterConnectionRepository";
import { AppError } from "@/server/lib/errors";
import {
  assertVerifiedBingSite,
  BingWebmasterError,
  listVerifiedBingSites,
  normalizeManualBingSite,
  toBingAppError,
  verifyBingSiteAccess,
} from "@/server/lib/free-sources/bing";
import { sealSecret } from "@/server/lib/free-sources/secret-box";

export async function listBingSitesForKey(apiKey: string) {
  try {
    return await listVerifiedBingSites({ apiKey });
  } catch (error) {
    throw toBingAppError(error);
  }
}

export async function saveBingConnection(input: {
  projectId: string;
  organizationId: string;
  userId: string;
  apiKey: string;
  siteUrl: string;
  /** Site typed by the user instead of picked from the key's site list. */
  manual?: boolean;
  /**
   * Manual path only: save even though Bing is limiting this server's IP
   * (ThrottleIP) so the check could not run. Never bypasses a rejected key or
   * a site the key does not own.
   */
  skipVerification?: boolean;
}): Promise<{ siteUrl: string; verified: boolean }> {
  const apiKey = input.apiKey.trim();
  const rawSite = input.siteUrl.trim();
  if (!apiKey || !rawSite) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Enter a Bing Webmaster API key and choose a verified site.",
    );
  }
  let siteUrl = rawSite;
  let verified = true;
  if (input.manual) {
    const normalized = normalizeManualBingSite(rawSite);
    if (!normalized) {
      throw new AppError("VALIDATION_ERROR", "The site address is not valid.");
    }
    siteUrl = normalized;
    try {
      await verifyBingSiteAccess({ apiKey, siteUrl });
    } catch (error) {
      const unverifiable =
        error instanceof BingWebmasterError && error.kind === "ip_throttled";
      if (!(input.skipVerification && unverifiable)) {
        throw toBingAppError(error);
      }
      verified = false;
    }
  } else {
    try {
      const site = await assertVerifiedBingSite({ apiKey, siteUrl });
      siteUrl = site.url;
    } catch (error) {
      throw toBingAppError(error);
    }
  }
  const encryptedApiKey = await sealSecret(apiKey);
  await BingWebmasterConnectionRepository.upsert({
    projectId: input.projectId,
    organizationId: input.organizationId,
    siteUrl,
    encryptedApiKey,
    connectedByUserId: input.userId,
  });
  return { siteUrl, verified };
}

export async function disconnectBing(projectId: string): Promise<void> {
  await BingWebmasterConnectionRepository.deleteByProjectId(projectId);
}
