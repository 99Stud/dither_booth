CREATE TABLE `kiosk_maintenance` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "kiosk_maintenance_singleton_check" CHECK("kiosk_maintenance"."id" = 1)
);
