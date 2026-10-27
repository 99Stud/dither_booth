CREATE TABLE `logo_asset` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
