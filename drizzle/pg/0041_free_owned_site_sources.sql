CREATE TABLE "bing_webmaster_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"site_url" text NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"connected_by_user_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bing_webmaster_connections" ADD CONSTRAINT "bing_webmaster_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bing_webmaster_connections" ADD CONSTRAINT "bing_webmaster_connections_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "bing_webmaster_connections_project_idx" ON "bing_webmaster_connections" ("project_id");
--> statement-breakpoint
CREATE INDEX "bing_webmaster_connections_organization_idx" ON "bing_webmaster_connections" ("organization_id");
--> statement-breakpoint
CREATE TABLE "owned_site_source_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"summary_json" text,
	"message" text,
	"fetched_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "owned_site_source_snapshots" ADD CONSTRAINT "owned_site_source_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "owned_site_source_snapshots" ADD CONSTRAINT "owned_site_source_snapshots_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "owned_site_source_snapshots_project_source_idx" ON "owned_site_source_snapshots" ("project_id","source");
--> statement-breakpoint
CREATE INDEX "owned_site_source_snapshots_organization_idx" ON "owned_site_source_snapshots" ("organization_id");
