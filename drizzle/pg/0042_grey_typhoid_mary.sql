CREATE TABLE "open_serp_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL,
	"source_id" text,
	"organic_rank" integer NOT NULL,
	"absolute_position" integer,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"hostname" text NOT NULL,
	"registrable_domain" text,
	"snippet" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_serp_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"project_id" text NOT NULL,
	"config_id" text NOT NULL,
	"tracking_keyword_id" text NOT NULL,
	"keyword" text NOT NULL,
	"engine" text DEFAULT 'google' NOT NULL,
	"region" text NOT NULL,
	"lang" text NOT NULL,
	"request_id" text,
	"status" text DEFAULT 'success' NOT NULL,
	"error_code" text,
	"limit_requested" integer NOT NULL,
	"results_returned" integer DEFAULT 0 NOT NULL,
	"fetched_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_serp_usage" (
	"project_id" text NOT NULL,
	"usage_date" text NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "open_serp_usage_project_id_usage_date_pk" PRIMARY KEY("project_id","usage_date")
);
--> statement-breakpoint
ALTER TABLE "rank_check_runs" ADD COLUMN "source_provider" text;--> statement-breakpoint
ALTER TABLE "rank_snapshots" ADD COLUMN "absolute_position" integer;--> statement-breakpoint
ALTER TABLE "open_serp_results" ADD CONSTRAINT "open_serp_results_snapshot_id_open_serp_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."open_serp_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_serp_snapshots" ADD CONSTRAINT "open_serp_snapshots_run_id_rank_check_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."rank_check_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_serp_snapshots" ADD CONSTRAINT "open_serp_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_serp_snapshots" ADD CONSTRAINT "open_serp_snapshots_config_id_rank_tracking_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."rank_tracking_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_serp_usage" ADD CONSTRAINT "open_serp_usage_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "open_serp_results_snapshot_rank_idx" ON "open_serp_results" USING btree ("snapshot_id","organic_rank");--> statement-breakpoint
CREATE INDEX "open_serp_results_snapshot_domain_idx" ON "open_serp_results" USING btree ("snapshot_id","registrable_domain");--> statement-breakpoint
CREATE UNIQUE INDEX "open_serp_snapshots_run_keyword_idx" ON "open_serp_snapshots" USING btree ("run_id","tracking_keyword_id");--> statement-breakpoint
CREATE INDEX "open_serp_snapshots_project_config_fetched_idx" ON "open_serp_snapshots" USING btree ("project_id","config_id","fetched_at");--> statement-breakpoint
CREATE INDEX "open_serp_usage_date_idx" ON "open_serp_usage" USING btree ("usage_date");--> statement-breakpoint