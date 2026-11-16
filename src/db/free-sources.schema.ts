import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { organization } from "./better-auth-schema";
import { projects } from "./app.schema";

// One Bing Webmaster API key + verified site per project. The key is stored
// encrypted (see secret-box.ts) and never returned to the client.
export const bingWebmasterConnections = sqliteTable(
  "bing_webmaster_connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Stored verbatim from GetUserSites. Url must match byte-for-byte.
    siteUrl: text("site_url").notNull(),
    encryptedApiKey: text("encrypted_api_key").notNull(),
    connectedByUserId: text("connected_by_user_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("bing_webmaster_connections_project_idx").on(table.projectId),
    index("bing_webmaster_connections_organization_idx").on(
      table.organizationId,
    ),
  ],
);

// Latest owned-site snapshot per project and free source. One row is upserted
// on each refresh so history cannot grow without bound.
export const ownedSiteSourceSnapshots = sqliteTable(
  "owned_site_source_snapshots",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    status: text("status").notNull(),
    summaryJson: text("summary_json"),
    message: text("message"),
    fetchedAt: text("fetched_at").notNull(),
  },
  (table) => [
    uniqueIndex("owned_site_source_snapshots_project_source_idx").on(
      table.projectId,
      table.source,
    ),
    index("owned_site_source_snapshots_organization_idx").on(
      table.organizationId,
    ),
  ],
);

// Sync run history for owned-site analytics & snapshots (T20/T22).
export const sourceSyncRuns = sqliteTable(
  "source_sync_runs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    state: text("state").notNull(),
    requestedAt: text("requested_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    periodStart: text("period_start"),
    periodEnd: text("period_end"),
    rowCount: integer("row_count").notNull().default(0),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    completeness: text("completeness").notNull().default("unknown"),
    coverageInfo: text("coverage_info"),
  },
  (table) => [
    index("source_sync_runs_project_source_idx").on(
      table.projectId,
      table.source,
      table.completedAt,
    ),
    index("source_sync_runs_organization_idx").on(table.organizationId),
  ],
);

// Normalized daily facts for GSC, GA4, and Bing Webmaster (T20/T21).
export const seoDailyFacts = sqliteTable(
  "seo_daily_facts",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    propertyId: text("property_id").notNull(),
    source: text("source").notNull(),
    factDate: text("fact_date").notNull(),
    grainType: text("grain_type").notNull(),
    grainKey: text("grain_key").notNull(),
    query: text("query"),
    pageUrl: text("page_url"),
    normalizedUrl: text("normalized_url"),
    country: text("country"),
    device: text("device"),
    clicks: integer("clicks"),
    impressions: integer("impressions"),
    ctr: real("ctr"),
    averagePosition: real("average_position"),
    organicSessions: integer("organic_sessions"),
    keyEvents: integer("key_events"),
    provenance: text("provenance").notNull(),
    syncRunId: text("sync_run_id"),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("seo_daily_facts_project_source_grain_idx").on(
      table.projectId,
      table.source,
      table.grainKey,
    ),
    index("seo_daily_facts_project_date_idx").on(
      table.projectId,
      table.source,
      table.factDate,
    ),
    index("seo_daily_facts_organization_idx").on(table.organizationId),
  ],
);

// Owned-site keyword opportunities & action backlog (T30/T32).
export const keywordOpportunities = sqliteTable(
  "keyword_opportunities",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    dedupeKey: text("dedupe_key").notNull(),
    query: text("query").notNull(),
    targetUrl: text("target_url"),
    rule: text("rule").notNull(),
    score: real("score"),
    scoreVersion: text("score_version").notNull(),
    partialScore: integer("partial_score", { mode: "boolean" })
      .notNull()
      .default(false),
    confidence: text("confidence").notNull(),
    evidencePeriod: text("evidence_period").notNull(),
    evidenceJson: text("evidence_json").notNull(),
    whySuggested: text("why_suggested").notNull(),
    status: text("status").notNull().default("new"),
    ownerUserId: text("owner_user_id"),
    note: text("note"),
    detectedAt: text("detected_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("keyword_opportunities_project_dedupe_idx").on(
      table.projectId,
      table.dedupeKey,
    ),
    index("keyword_opportunities_project_status_idx").on(
      table.projectId,
      table.status,
    ),
    index("keyword_opportunities_organization_idx").on(table.organizationId),
  ],
);

// Rule-based keyword clusters (T31).
export const keywordClusters = sqliteTable(
  "keyword_clusters",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    intent: text("intent").notNull().default("unknown"),
    algorithmVersion: text("algorithm_version").notNull(),
    confidence: text("confidence").notNull(),
    evidenceCount: integer("evidence_count").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("keyword_clusters_project_idx").on(table.projectId),
    index("keyword_clusters_organization_idx").on(table.organizationId),
  ],
);

export const keywordClusterMembers = sqliteTable(
  "keyword_cluster_members",
  {
    id: text("id").primaryKey(),
    clusterId: text("cluster_id")
      .notNull()
      .references(() => keywordClusters.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    source: text("source").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("keyword_cluster_members_cluster_query_idx").on(
      table.clusterId,
      table.query,
    ),
    index("keyword_cluster_members_project_idx").on(table.projectId),
  ],
);

// GEO Evidence CSV import batches & daily facts (T60/T61).
export const geoImportBatches = sqliteTable(
  "geo_import_batches",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    reportType: text("report_type").notNull(),
    filename: text("filename").notNull(),
    filenameHash: text("filename_hash").notNull(),
    schemaMappingVersion: text("schema_mapping_version").notNull(),
    recordCount: integer("record_count").notNull().default(0),
    validationStatus: text("validation_status").notNull(),
    completeness: text("completeness").notNull().default("sampled"),
    importedByUserId: text("imported_by_user_id").notNull(),
    importedAt: text("imported_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("geo_import_batches_project_source_idx").on(
      table.projectId,
      table.source,
      table.importedAt,
    ),
    index("geo_import_batches_organization_idx").on(table.organizationId),
  ],
);

export const geoDailyFacts = sqliteTable(
  "geo_daily_facts",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    batchId: text("batch_id")
      .notNull()
      .references(() => geoImportBatches.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    factDate: text("fact_date").notNull(),
    metricType: text("metric_type").notNull(),
    pageUrl: text("page_url"),
    queryOrTopic: text("query_or_topic"),
    country: text("country"),
    device: text("device"),
    metricValue: integer("metric_value").notNull(),
    rowFingerprint: text("row_fingerprint").notNull(),
    completeness: text("completeness").notNull().default("sampled"),
  },
  (table) => [
    uniqueIndex("geo_daily_facts_project_source_fp_idx").on(
      table.projectId,
      table.source,
      table.rowFingerprint,
    ),
    index("geo_daily_facts_project_date_idx").on(
      table.projectId,
      table.source,
      table.factDate,
    ),
    index("geo_daily_facts_batch_idx").on(table.batchId),
  ],
);

// Bing Webmaster observed backlink sample snapshots (T70).
export const bingLinkSnapshots = sqliteTable(
  "bing_link_snapshots",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    batchKey: text("batch_key").notNull(),
    fetchedAt: text("fetched_at").notNull(),
    targetUrl: text("target_url").notNull(),
    referringDomain: text("referring_domain").notNull(),
    referringUrl: text("referring_url"),
    anchorText: text("anchor_text"),
    linkCount: integer("link_count").notNull().default(1),
  },
  (table) => [
    index("bing_link_snapshots_project_fetched_idx").on(
      table.projectId,
      table.fetchedAt,
    ),
    index("bing_link_snapshots_organization_idx").on(table.organizationId),
  ],
);
