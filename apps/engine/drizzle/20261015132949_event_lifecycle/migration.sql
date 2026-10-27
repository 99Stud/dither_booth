PRAGMA foreign_keys=OFF;--> statement-breakpoint
-- drizzle-kit 0.31 qualifies CHECK columns with the table name, which SQLite
-- rejects once `__new_campaign` is renamed, so the CHECK is unqualified by
-- hand, as in 0009 and 0011.
CREATE TABLE `__new_campaign` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`lottery_id` text,
	`ticket_item_names` text DEFAULT '["99stud","El Tony Mate","Épicerie Ginette"]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`lottery_id`) REFERENCES `lottery`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "campaign_status_check" CHECK("status" in ('active', 'archived'))
);
--> statement-breakpoint
-- The generated copy selected the new columns from the old table. Written by
-- hand: `created_at` and `updated_at` take the migration time, and only the
-- lowest-rowid campaign stays active, the one the booth showed until now. A
-- dev database seeded next to an admin-created event can hold two, and the
-- unique index below would refuse both.
INSERT INTO `__new_campaign`("id", "name", "lottery_id", "ticket_item_names", "status")
SELECT
	"id",
	"name",
	"lottery_id",
	"ticket_item_names",
	CASE WHEN rowid = (SELECT MIN(rowid) FROM `campaign`) THEN 'active' ELSE 'archived' END
FROM `campaign`;--> statement-breakpoint
DROP TABLE `campaign`;--> statement-breakpoint
ALTER TABLE `__new_campaign` RENAME TO `campaign`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_single_active_idx` ON `campaign` (`status`) WHERE "campaign"."status" = 'active';--> statement-breakpoint
-- An ADD, not a rebuild, so `draw` keeps the `draw_requires_stock` trigger
-- from 0011.
ALTER TABLE `draw` ADD `campaign_id` text REFERENCES campaign(id);--> statement-breakpoint
CREATE INDEX `draw_campaign_id_idx` ON `draw` (`campaign_id`);--> statement-breakpoint
-- Until now an event was replaced by deleting it, so every draw with a
-- lottery belongs to that lottery's campaign. Draws recorded while no lottery
-- was enabled can't be placed and stay null, as `listDraws` already hid them.
UPDATE `draw`
SET `campaign_id` = (SELECT `campaign`.`id` FROM `campaign` WHERE `campaign`.`lottery_id` = `draw`.`lottery_id`)
WHERE `lottery_id` IS NOT NULL;
