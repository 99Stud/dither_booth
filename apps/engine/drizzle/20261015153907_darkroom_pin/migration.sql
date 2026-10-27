CREATE TABLE `darkroom_access` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`pin_hash` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "darkroom_access_singleton_check" CHECK("darkroom_access"."id" = 1)
);
