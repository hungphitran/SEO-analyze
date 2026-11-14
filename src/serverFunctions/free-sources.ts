import { createServerFn } from "@tanstack/react-start";
import { requireOrgPermission } from "@/server/auth/org-gate";
import {
  disconnectBing,
  getFreeSourcesStatus,
  listBingSitesForKey,
  refreshOwnedSiteSources,
  saveBingConnection,
} from "@/server/features/free-sources/services/FreeSourcesService";
import {
  getCruxVitals,
  getOpenPageRank,
} from "@/server/features/free-sources/services/RealUserSignalsService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  cruxVitalsSchema,
  freeSourcesProjectSchema,
  listBingSitesSchema,
  openPageRankSchema,
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
      manual: data.manual,
      skipVerification: data.skipVerification,
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

/** Real-user Core Web Vitals (CrUX). `{ state: "disabled" }` when no key is set. */
export const getCruxVitalsFn = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(cruxVitalsSchema)
  .handler(async ({ data, context }) =>
    getCruxVitals({
      domain: context.project.domain,
      formFactor: data.formFactor,
    }),
  );

/** Open PageRank authority score. `{ state: "disabled" }` when no key is set. */
export const getOpenPageRankFn = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(openPageRankSchema)
  .handler(async ({ data }) => getOpenPageRank({ domain: data.domain }));
