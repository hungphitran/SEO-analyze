import { createServerFn } from "@tanstack/react-start";
import { requireOrgPermission } from "@/server/auth/org-gate";
import {
  disconnectBing,
  getFreeSourcesStatus,
  listBingSitesForKey,
  refreshOwnedSiteSources,
  saveBingConnection,
} from "@/server/features/free-sources/services/FreeSourcesService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  freeSourcesProjectSchema,
  listBingSitesSchema,
  saveBingConnectionSchema,
} from "@/types/schemas/free-sources";

export const getFreeSourcesStatusFn = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(freeSourcesProjectSchema)
  .handler(async ({ context }) =>
    getFreeSourcesStatus({ projectId: context.projectId }),
  );

export const listBingWebmasterSitesFn = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(listBingSitesSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    return listBingSitesForKey(data.apiKey);
  });

export const saveBingWebmasterConnectionFn = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(saveBingConnectionSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    return saveBingConnection({
      projectId: context.projectId,
      organizationId: context.organizationId,
      userId: context.userId,
      apiKey: data.apiKey,
      siteUrl: data.siteUrl,
    });
  });

export const disconnectBingWebmasterFn = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(freeSourcesProjectSchema)
  .handler(async ({ context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    await disconnectBing(context.projectId);
    return { success: true };
  });

export const refreshOwnedSiteSourcesFn = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(freeSourcesProjectSchema)
  .handler(async ({ context }) =>
    refreshOwnedSiteSources({
      projectId: context.projectId,
      organizationId: context.organizationId,
      domain: context.project.domain,
    }),
  );
