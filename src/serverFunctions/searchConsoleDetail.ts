import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  GscNotConnectedError,
  GscService,
  isExpectedGrantFailure,
} from "@/server/features/gsc/services/GscService";
import { toSitemapRows } from "@/server/features/gsc/sitemaps";
import { toUrlInspectionView } from "@/server/features/gsc/urlInspection";
import { requireProjectContext } from "@/serverFunctions/middleware";

const projectInputSchema = z.object({ projectId: z.string().min(1) });

const inspectInputSchema = z.object({
  projectId: z.string().min(1),
  inspectionUrl: z
    .string()
    .trim()
    .max(2048)
    .refine((value) => /^https?:\/\//i.test(value) && URL.canParse(value)),
});

/** Not connected, or a dead/denied grant: the tab shows the connect card. */
function isExpectedConnectionFailure(error: unknown): boolean {
  return error instanceof GscNotConnectedError || isExpectedGrantFailure(error);
}

/** Sitemaps submitted for the project's property, with Google's status. Free
 *  first-party GSC data on the existing `webmasters.readonly` scope. */
export const getGscSitemaps = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectInputSchema)
  .handler(async ({ context }) => {
    try {
      const result = await GscService.listSitemaps({
        projectId: context.projectId,
      });
      return {
        connected: true as const,
        siteUrl: result.siteUrl,
        sitemaps: toSitemapRows(result.sitemaps),
      };
    } catch (error) {
      if (isExpectedConnectionFailure(error)) {
        return { connected: false as const };
      }
      throw error;
    }
  });

/** URL Inspection for one URL of the connected property (index status,
 *  canonical, last crawl, mobile usability, rich results). */
export const inspectGscUrl = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(inspectInputSchema)
  .handler(async ({ data, context }) => {
    try {
      const { siteUrl, results } = await GscService.inspectUrls({
        projectId: context.projectId,
        urls: [data.inspectionUrl],
      });
      const [first] = results;
      return {
        connected: true as const,
        siteUrl,
        url: data.inspectionUrl,
        error: first?.error ?? null,
        inspection: first?.result ? toUrlInspectionView(first.result) : null,
      };
    } catch (error) {
      if (isExpectedConnectionFailure(error)) {
        return { connected: false as const };
      }
      throw error;
    }
  });
