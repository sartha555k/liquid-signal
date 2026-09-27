CREATE TABLE `analysis_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`analysis_json` text NOT NULL,
	`model` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_analysis_cache_created_at` ON `analysis_cache` (`created_at`);--> statement-breakpoint
ALTER TABLE `datasets` ADD `audience_question_json` text;--> statement-breakpoint
PRAGMA optimize;
