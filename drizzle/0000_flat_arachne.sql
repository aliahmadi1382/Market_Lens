CREATE TABLE `research_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`query` text NOT NULL,
	`created_at` text NOT NULL,
	`payload` text NOT NULL,
	`listing_count` integer NOT NULL
);
