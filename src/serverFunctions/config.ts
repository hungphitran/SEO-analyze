import { createServerFn } from "@tanstack/react-start";
import { isFreeSourcesOnly } from "@/server/lib/free-sources/mode";
import { hasDataforseoAccess } from "@/server/lib/provider-access";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

export const getSeoApiKeyStatus = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async () => {
    // hasDataforseoAccess is false under FREE_SOURCES_ONLY even if a key is
    // stored, because paid DataForSEO calls are blocked. The client uses
    // freeSourcesOnly to hide the "add your DataForSEO API key" nag.
    const [configured, freeSourcesOnly] = await Promise.all([
      hasDataforseoAccess(),
      isFreeSourcesOnly(),
    ]);
    return { configured, freeSourcesOnly };
  });
