CREATE TABLE `open_serp_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` text NOT NULL,
	`source_id` text,
	`organic_rank` integer NOT NULL,
	`absolute_position` integer,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`hostname` text NOT NULL,
	`registrable_domain` text,
	`snippet` text NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `open_serp_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `open_serp_results_snapshot_rank_idx` ON `open_serp_results` (`snapshot_id`,`organic_rank`);--> statement-breakpoint
CREATE INDEX `open_serp_results_snapshot_domain_idx` ON `open_serp_results` (`snapshot_id`,`registrable_domain`);--> statement-breakpoint
CREATE TABLE `open_serp_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`project_id` text NOT NULL,
	`config_id` text NOT NULL,
	`tracking_keyword_id` text NOT NULL,
	`keyword` text NOT NULL,
	`engine` text DEFAULT 'google' NOT NULL,
	`region` text NOT NULL,
	`lang` text NOT NULL,
	`request_id` text,
	`status` text DEFAULT 'success' NOT NULL,
	`error_code` text,
	`limit_requested` integer NOT NULL,
	`results_returned` integer DEFAULT 0 NOT NULL,
	`fetched_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `rank_check_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`config_id`) REFERENCES `rank_tracking_configs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `open_serp_snapshots_run_keyword_idx` ON `open_serp_snapshots` (`run_id`,`tracking_keyword_id`);--> statement-breakpoint
CREATE INDEX `open_serp_snapshots_project_config_fetched_idx` ON `open_serp_snapshots` (`project_id`,`config_id`,`fetched_at`);--> statement-breakpoint
CREATE TABLE `open_serp_usage` (
	`project_id` text NOT NULL,
	`usage_date` text NOT NULL,
	`requests` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`project_id`, `usage_date`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `open_serp_usage_date_idx` ON `open_serp_usage` (`usage_date`);--> statement-breakpoint
ALTER TABLE `rank_check_runs` ADD `source_provider` text;--> statement-breakpoint
ALTER TABLE `rank_snapshots` ADD `absolute_position` integer;