import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import { diffCrawlSnapshots } from "@/server/features/audit/services/CrawlDiffService";
import { getBingLinkSampleHistory } from "@/server/features/free-sources/services/BingLinkSnapshotService";
import { KeywordOpportunityRepository } from "@/server/features/free-sources/repositories/KeywordOpportunityRepository";
import { SeoFactsRepository } from "@/server/features/free-sources/repositories/SeoFactsRepository";
import {
  commitGeoCsvImport,
  getGeoEvidenceSummary,
  previewGeoCsvImport,
  rollbackGeoImportBatch,
} from "@/server/features/free-sources/services/GeoEvidenceService";
import { refreshKeywordOpportunitiesFromFacts } from "@/server/features/free-sources/services/KeywordOpportunityService";
import { syncOwnedSiteFacts } from "@/server/features/free-sources/services/OwnedSiteAnalyticsService";
import { requireProjectContext } from "@/serverFunctions/middleware";

const projectOnlySchema = z.object({
  projectId: z.string().min(1),
});

const syncFactsSchema = z.object({
  projectId: z.string().min(1),
  source: z.enum(["gsc", "bing_webmaster", "ga4"]),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const listOpportunitiesSchema = z.object({
  projectId: z.string().min(1),
  status: z.enum(["new", "in_progress", "resolved", "ignored"]).optional(),
  rule: z
    .enum([
      "ctr_opportunity",
      "near_top",
      "decaying",
      "growing",
      "cannibalization",
      "content_gap",
    ])
    .optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const updateOpportunitySchema = z.object({
  projectId: z.string().min(1),
  opportunityId: z.string().min(1),
  status: z.enum(["new", "in_progress", "resolved", "ignored"]),
  note: z.string().max(1000).nullable().optional(),
});

const geoMappingSchema = z
  .object({
    dateColumn: z.string().min(1),
    metricColumn: z.string().min(1),
    pageColumn: z.string().optional(),
    queryColumn: z.string().optional(),
    countryColumn: z.string().optional(),
    deviceColumn: z.string().optional(),
  })
  .optional();

const previewGeoCsvSchema = z.object({
  projectId: z.string().min(1),
  source: z.enum(["bing_ai_csv", "google_genai_csv"]),
  csvText: z.string().min(1),
  mapping: geoMappingSchema,
});

const commitGeoCsvSchema = z.object({
  projectId: z.string().min(1),
  source: z.enum(["bing_ai_csv", "google_genai_csv"]),
  reportType: z.string().min(1).max(100),
  filename: z.string().min(1).max(255),
  csvText: z.string().min(1),
  allowOutOfScope: z.boolean().optional(),
  mapping: geoMappingSchema,
});

const rollbackGeoSchema = z.object({
  projectId: z.string().min(1),
  batchId: z.string().min(1),
});

export const syncOwnedSiteFactsFn = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(syncFactsSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    return syncOwnedSiteFacts({
      projectId: context.projectId,
      organizationId: context.organizationId,
      source: data.source,
      startDate: data.startDate,
      endDate: data.endDate,
    });
  });

export const refreshKeywordOpportunitiesFn = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectOnlySchema)
  .handler(async ({ context }) =>
    refreshKeywordOpportunitiesFromFacts({
      projectId: context.projectId,
      organizationId: context.organizationId,
    }),
  );

export const listKeywordOpportunitiesFn = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(listOpportunitiesSchema)
  .handler(async ({ data, context }) =>
    KeywordOpportunityRepository.list({
      projectId: context.projectId,
      status: data.status,
      rule: data.rule,
      limit: data.limit,
    }),
  );

export const updateOpportunityActionFn = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateOpportunitySchema)
  .handler(async ({ data, context }) =>
    KeywordOpportunityRepository.updateAction({
      projectId: context.projectId,
      opportunityId: data.opportunityId,
      status: data.status,
      note: data.note,
      ownerUserId: context.userId,
    }),
  );

export const listKeywordClustersFn = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(projectOnlySchema)
  .handler(async ({ context }) =>
    KeywordOpportunityRepository.listClusters(context.projectId),
  );

export const previewGeoCsvFn = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(previewGeoCsvSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    return previewGeoCsvImport({
      source: data.source,
      csvText: data.csvText,
      projectDomain: context.project.domain ?? "",
      mapping: data.mapping,
    });
  });

export const commitGeoCsvFn = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(commitGeoCsvSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    return commitGeoCsvImport({
      projectId: context.projectId,
      organizationId: context.organizationId,
      userId: context.userId,
      source: data.source,
      reportType: data.reportType,
      filename: data.filename,
      csvText: data.csvText,
      projectDomain: context.project.domain ?? "",
      allowOutOfScope: data.allowOutOfScope,
      mapping: data.mapping,
    });
  });

export const rollbackGeoBatchFn = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(rollbackGeoSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    return rollbackGeoImportBatch({
      projectId: context.projectId,
      batchId: data.batchId,
    });
  });

export const getGeoEvidenceFn = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(projectOnlySchema)
  .handler(async ({ context }) => getGeoEvidenceSummary(context.projectId));

const crawlDiffSchema = z.object({
  projectId: z.string().min(1),
  currentAuditId: z.string().min(1),
  previousAuditId: z.string().min(1).optional(),
});

function mapAuditPageForDiff(p: {
  url: string;
  statusCode: number | null;
  redirectUrl: string | null;
  title: string | null;
  metaDescription: string | null;
  isIndexable: boolean;
  inSitemap: boolean;
}) {
  return {
    url: p.url,
    statusCode: p.statusCode,
    redirectUrl: p.redirectUrl,
    title: p.title,
    metaDescription: p.metaDescription,
    canonicalUrl: null,
    isIndexable: p.isIndexable,
    inlinkCount: null,
    inSitemap: p.inSitemap,
  };
}

export const getAuditCrawlDiffFn = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(crawlDiffSchema)
  .handler(async ({ data, context }) => {
    const audits = await AuditRepository.getAuditsByProject(context.projectId);
    const currentAudit = audits.find((a) => a.id === data.currentAuditId);
    if (!currentAudit) {
      return {
        available: false as const,
        reason: "Không tìm thấy bản crawl hiện tại.",
      };
    }
    const currentIdx = audits.findIndex((a) => a.id === data.currentAuditId);
    const previousAudit = data.previousAuditId
      ? audits.find((a) => a.id === data.previousAuditId)
      : audits.slice(currentIdx + 1).find((a) => a.id !== currentAudit.id);

    if (!previousAudit) {
      return {
        available: false as const,
        reason: "Cần ít nhất 2 lần crawl để so sánh thay đổi.",
      };
    }

    const [prevPages, currPages, gscFacts] = await Promise.all([
      AuditRepository.getPagesForAudit(previousAudit.id),
      AuditRepository.getPagesForAudit(currentAudit.id),
      SeoFactsRepository.listDailyFacts({
        projectId: context.projectId,
        source: "gsc",
        limit: 2000,
      }),
    ]);

    const gscKnownUrls = Array.from(
      new Set(
        gscFacts
          .map((f) => f.pageUrl)
          .filter((u): u is string => typeof u === "string" && u.length > 0),
      ),
    );

    const diff = diffCrawlSnapshots({
      previousPages: prevPages.map(mapAuditPageForDiff),
      currentPages: currPages.map(mapAuditPageForDiff),
      previousComplete: previousAudit.status === "completed",
      currentComplete: currentAudit.status === "completed",
      gscKnownUrls,
    });

    return {
      available: true as const,
      previousAuditId: previousAudit.id,
      previousStartedAt: previousAudit.startedAt,
      currentStartedAt: currentAudit.startedAt,
      diff,
    };
  });

export const getBingLinkHistoryFn = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(projectOnlySchema)
  .handler(async ({ context }) => getBingLinkSampleHistory(context.projectId));
