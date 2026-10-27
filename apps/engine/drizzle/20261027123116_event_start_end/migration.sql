PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_campaign` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`lottery_id` text,
	`ticket_item_names` text DEFAULT '["99stud","El Tony Mate","Épicerie Ginette"]' NOT NULL,
	`kit_id` text,
	`kit_settings` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `campaign_lottery_id_lottery_id_fk` FOREIGN KEY (`lottery_id`) REFERENCES `lottery`(`id`),
	CONSTRAINT "campaign_status_check" CHECK("status" in ('active', 'archived')),
	CONSTRAINT "campaign_start_end_check" CHECK("starts_at" is null or "ends_at" is null or "ends_at" > "starts_at")
);
--> statement-breakpoint
INSERT INTO `__new_campaign`(`id`, `name`, `lottery_id`, `ticket_item_names`, `kit_id`, `kit_settings`, `status`, `created_at`, `updated_at`) SELECT `id`, `name`, `lottery_id`, `ticket_item_names`, `kit_id`, `kit_settings`, `status`, `created_at`, `updated_at` FROM `campaign`;--> statement-breakpoint
DROP TABLE `campaign`;--> statement-breakpoint
ALTER TABLE `__new_campaign` RENAME TO `campaign`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_single_active_idx` ON `campaign` (`status`) WHERE "campaign"."status" = 'active';