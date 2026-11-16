CREATE TABLE "bing_link_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"batch_key" text NOT NULL,
	"fetched_at" text NOT NULL,
	"target_url" text NOT NULL,
	"referring_domain" text NOT NULL,
	"referring_url" text,
	"anchor_text" text,
	"link_count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geo_daily_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"source" text NOT NULL,
	"fact_date" text NOT NULL,
	"metric_type" text NOT NULL,
	"page_url" text,
	"query_or_topic" text,
	"country" text,
	"device" text,
	"metric_value" integer NOT NULL,
	"row_fingerprint" text NOT NULL,
	"completeness" text DEFAULT 'sampled' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geo_import_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"source" text NOT NULL,
	"report_type" text NOT NULL,
	"filename" text NOT NULL,
	"filename_hash" text NOT NULL,
	"schema_mapping_version" text NOT NULL,
	"record_count" integer DEFAULT 0 NOT NULL,
	"validation_status" text NOT NULL,
	"completeness" text DEFAULT 'sampled' NOT NULL,
	"imported_by_user_id" text NOT NULL,
	"imported_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keyword_cluster_members" (
	"id" text PRIMARY KEY NOT NULL,
	"cluster_id" text NOT NULL,
	"project_id" text NOT NULL,
	"query" text NOT NULL,
	"source" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keyword_clusters" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"intent" text DEFAULT 'unknown' NOT NULL,
	"algorithm_version" text NOT NULL,
	"confidence" text NOT NULL,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keyword_opportunities" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"query" text NOT NULL,
	"target_url" text,
	"rule" text NOT NULL,
	"score" real,
	"score_version" text NOT NULL,
	"partial_score" boolean DEFAULT false NOT NULL,
	"confidence" text NOT NULL,
	"evidence_period" text NOT NULL,
	"evidence_json" text NOT NULL,
	"why_suggested" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"owner_user_id" text,
	"note" text,
	"detected_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_daily_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"property_id" text NOT NULL,
	"source" text NOT NULL,
	"fact_date" text NOT NULL,
	"grain_type" text NOT NULL,
	"grain_key" text NOT NULL,
	"query" text,
	"page_url" text,
	"normalized_url" text,
	"country" text,
	"device" text,
	"clicks" integer,
	"impressions" integer,
	"ctr" real,
	"average_position" real,
	"organic_sessions" integer,
	"key_events" integer,
	"provenance" text NOT NULL,
	"sync_run_id" text,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_sync_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"source" text NOT NULL,
	"state" text NOT NULL,
	"requested_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"started_at" text,
	"completed_at" text,
	"period_start" text,
	"period_end" text,
	"row_count" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text,
	"completeness" text DEFAULT 'unknown' NOT NULL,
	"coverage_info" text
);
--> statement-breakpoint
ALTER TABLE "bing_link_snapshots" ADD CONSTRAINT "bing_link_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bing_link_snapshots" ADD CONSTRAINT "bing_link_snapshots_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_daily_facts" ADD CONSTRAINT "geo_daily_facts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_daily_facts" ADD CONSTRAINT "geo_daily_facts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_daily_facts" ADD CONSTRAINT "geo_daily_facts_batch_id_geo_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."geo_import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_import_batches" ADD CONSTRAINT "geo_import_batches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_import_batches" ADD CONSTRAINT "geo_import_batches_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_cluster_members" ADD CONSTRAINT "keyword_cluster_members_cluster_id_keyword_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."keyword_clusters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_cluster_members" ADD CONSTRAINT "keyword_cluster_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_clusters" ADD CONSTRAINT "keyword_clusters_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_clusters" ADD CONSTRAINT "keyword_clusters_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_opportunities" ADD CONSTRAINT "keyword_opportunities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_opportunities" ADD CONSTRAINT "keyword_opportunities_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_daily_facts" ADD CONSTRAINT "seo_daily_facts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_daily_facts" ADD CONSTRAINT "seo_daily_facts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_sync_runs" ADD CONSTRAINT "source_sync_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_sync_runs" ADD CONSTRAINT "source_sync_runs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bing_link_snapshots_project_fetched_idx" ON "bing_link_snapshots" USING btree ("project_id","fetched_at");--> statement-breakpoint
CREATE INDEX "bing_link_snapshots_organization_idx" ON "bing_link_snapshots" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "geo_daily_facts_project_source_fp_idx" ON "geo_daily_facts" USING btree ("project_id","source","row_fingerprint");--> statement-breakpoint
CREATE INDEX "geo_daily_facts_project_date_idx" ON "geo_daily_facts" USING btree ("project_id","source","fact_date");--> statement-breakpoint
CREATE INDEX "geo_daily_facts_batch_idx" ON "geo_daily_facts" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "geo_import_batches_project_source_idx" ON "geo_import_batches" USING btree ("project_id","source","imported_at");--> statement-breakpoint
CREATE INDEX "geo_import_batches_organization_idx" ON "geo_import_batches" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "keyword_cluster_members_cluster_query_idx" ON "keyword_cluster_members" USING btree ("cluster_id","query");--> statement-breakpoint
CREATE INDEX "keyword_cluster_members_project_idx" ON "keyword_cluster_members" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "keyword_clusters_project_idx" ON "keyword_clusters" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "keyword_clusters_organization_idx" ON "keyword_clusters" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "keyword_opportunities_project_dedupe_idx" ON "keyword_opportunities" USING btree ("project_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "keyword_opportunities_project_status_idx" ON "keyword_opportunities" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "keyword_opportunities_organization_idx" ON "keyword_opportunities" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seo_daily_facts_project_source_grain_idx" ON "seo_daily_facts" USING btree ("project_id","source","grain_key");--> statement-breakpoint
CREATE INDEX "seo_daily_facts_project_date_idx" ON "seo_daily_facts" USING btree ("project_id","source","fact_date");--> statement-breakpoint
CREATE INDEX "seo_daily_facts_organization_idx" ON "seo_daily_facts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "source_sync_runs_project_source_idx" ON "source_sync_runs" USING btree ("project_id","source","completed_at");--> statement-breakpoint
CREATE INDEX "source_sync_runs_organization_idx" ON "source_sync_runs" USING btree ("organization_id");