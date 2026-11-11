import { sql } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { organization } from "./better-auth-schema";
import { projects } from "./app.schema";

// See src/db/pg/app.schema.ts for why timestamps are ISO-8601 UTC text.
const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export const bingWebmasterConnections = pgTable(
  "bing_webmaster_connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    siteUrl: text("site_url").notNull(),
    encryptedApiKey: text("encrypted_api_key").notNull(),
    connectedByUserId: text("connected_by_user_id").notNull(),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("bing_webmaster_connections_project_idx").on(table.projectId),
    index("bing_webmaster_connections_organization_idx").on(
      table.organizationId,
    ),
  ],
);

export const ownedSiteSourceSnapshots = pgTable(
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
