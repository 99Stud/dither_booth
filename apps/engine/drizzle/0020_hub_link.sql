CREATE TABLE `hub_link` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`hub_url` text NOT NULL,
	`booth_id` text NOT NULL,
	`booth_name` text NOT NULL,
	`refresh_token` text NOT NULL,
	`linked_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "hub_link_singleton_check" CHECK("hub_link"."id" = 1)
);
