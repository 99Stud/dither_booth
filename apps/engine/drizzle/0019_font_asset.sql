CREATE TABLE `font_asset` (
	`id` text PRIMARY KEY NOT NULL,
	`family` text NOT NULL,
	`source` text NOT NULL,
	`license` text NOT NULL,
	`files` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "font_asset_source_check" CHECK("font_asset"."source" in ('fontsource', 'upload'))
);
