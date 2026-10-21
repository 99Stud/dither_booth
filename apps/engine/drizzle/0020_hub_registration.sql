CREATE TABLE `hub_registration` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`hub_url` text NOT NULL,
	`booth_id` text NOT NULL,
	`booth_name` text NOT NULL,
	`refresh_token` text NOT NULL,
	`registered_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "hub_registration_singleton_check" CHECK("hub_registration"."id" = 1)
);
