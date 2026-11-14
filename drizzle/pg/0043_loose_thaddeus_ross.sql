ALTER TABLE "audit_pages" ADD COLUMN "hreflang_json" text;--> statement-breakpoint
ALTER TABLE "audit_pages" ADD COLUMN "html_lang" text;--> statement-breakpoint
ALTER TABLE "audit_pages" ADD COLUMN "has_viewport" boolean;--> statement-breakpoint
ALTER TABLE "audit_pages" ADD COLUMN "twitter_card" text;--> statement-breakpoint
ALTER TABLE "audit_pages" ADD COLUMN "mixed_content_count" integer;--> statement-breakpoint
ALTER TABLE "audit_pages" ADD COLUMN "json_ld_count" integer;--> statement-breakpoint
ALTER TABLE "audit_pages" ADD COLUMN "json_ld_invalid_count" integer;--> statement-breakpoint
ALTER TABLE "audit_pages" ADD COLUMN "html_bytes" integer;--> statement-breakpoint
ALTER TABLE "audit_pages" ADD COLUMN "inlink_count" integer;