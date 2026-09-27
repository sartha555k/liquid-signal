CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`dataset_id` text NOT NULL,
	`source` text NOT NULL,
	`source_id` text,
	`text` text NOT NULL,
	`published_at` text,
	`analysis_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`dataset_id`) REFERENCES `datasets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_comments_dataset_id` ON `comments` (`dataset_id`);--> statement-breakpoint
CREATE INDEX `idx_comments_source_id` ON `comments` (`source_id`);--> statement-breakpoint
CREATE TABLE `datasets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`source` text NOT NULL,
	`source_label` text NOT NULL,
	`comment_count` integer DEFAULT 0 NOT NULL,
	`analyzed_at` text,
	`model` text,
	`input_tokens` integer,
	`cost_micros` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_datasets_updated_at` ON `datasets` (`updated_at`);