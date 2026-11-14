ALTER TABLE `audit_pages` ADD `hreflang_json` text;--> statement-breakpoint
ALTER TABLE `audit_pages` ADD `html_lang` text;--> statement-breakpoint
ALTER TABLE `audit_pages` ADD `has_viewport` integer;--> statement-breakpoint
ALTER TABLE `audit_pages` ADD `twitter_card` text;--> statement-breakpoint
ALTER TABLE `audit_pages` ADD `mixed_content_count` integer;--> statement-breakpoint
ALTER TABLE `audit_pages` ADD `json_ld_count` integer;--> statement-breakpoint
ALTER TABLE `audit_pages` ADD `json_ld_invalid_count` integer;--> statement-breakpoint
ALTER TABLE `audit_pages` ADD `html_bytes` integer;--> statement-breakpoint
ALTER TABLE `audit_pages` ADD `inlink_count` integer;