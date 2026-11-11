import { sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
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
