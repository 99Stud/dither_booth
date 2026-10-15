CREATE TABLE `stock_adjustment` (
	`id` text PRIMARY KEY NOT NULL,
	`prize_id` text NOT NULL,
	`delta` integer NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`prize_id`) REFERENCES `prize`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stock_adjustment_delta_check" CHECK("delta" <> 0),
	CONSTRAINT "stock_adjustment_reason_check" CHECK("reason" in ('initial', 'restock', 'correction'))
);
--> statement-breakpoint
CREATE INDEX `stock_adjustment_prize_id_idx` ON `stock_adjustment` (`prize_id`);--> statement-breakpoint
-- Backfill: carry today's stock over before the old columns are dropped.
-- remaining = sum(delta) - wins, so each prize gets its total as an initial
-- row plus a correction for whatever the old columns no longer explain.
INSERT INTO `stock_adjustment` (`id`, `prize_id`, `delta`, `reason`)
SELECT 'backfill-initial-' || `id`, `id`, `total_quantity`, 'initial'
FROM `prize`
WHERE `total_quantity` <> 0;--> statement-breakpoint
INSERT INTO `stock_adjustment` (`id`, `prize_id`, `delta`, `reason`)
SELECT
	'backfill-correction-' || `prize`.`id`,
	`prize`.`id`,
	`prize`.`remaining_quantity`
		+ (SELECT COUNT(*) FROM `draw` WHERE `draw`.`prize_id` = `prize`.`id`)
		- `prize`.`total_quantity`,
	'correction'
FROM `prize`
WHERE `prize`.`remaining_quantity`
	+ (SELECT COUNT(*) FROM `draw` WHERE `draw`.`prize_id` = `prize`.`id`)
	- `prize`.`total_quantity` <> 0;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
-- drizzle-kit 0.31 qualifies CHECK columns with the table name. In the
-- `__new_prize` rebuild that name stops existing at the RENAME, which SQLite
-- rejects ("no such column: __new_prize.weight"), so the CHECKs below are
-- unqualified by hand, as in 0009.
CREATE TABLE `__new_prize` (
	`id` text PRIMARY KEY NOT NULL,
	`lottery_id` text NOT NULL,
	`title` text NOT NULL,
	`win_instruction` text NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`rarity` text DEFAULT 'common' NOT NULL,
	`removed` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`lottery_id`) REFERENCES `lottery`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prize_weight_check" CHECK("weight" > 0),
	CONSTRAINT "prize_removed_check" CHECK("removed" in (0, 1))
);
--> statement-breakpoint
INSERT INTO `__new_prize`("id", "lottery_id", "title", "win_instruction", "weight", "rarity", "removed") SELECT "id", "lottery_id", "title", "win_instruction", "weight", "rarity", "removed" FROM `prize`;--> statement-breakpoint
DROP TABLE `prize`;--> statement-breakpoint
ALTER TABLE `__new_prize` RENAME TO `prize`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `draw_prize_id_idx` ON `draw` (`prize_id`);--> statement-breakpoint
-- The old CHECK kept remaining_quantity between 0 and total_quantity. These
-- triggers keep the same guarantee on the ledger. drizzle-kit does not track
-- triggers, and rebuilding `draw` or `stock_adjustment` drops them, which
-- db.migrations.test.ts catches.
--
-- BEFORE INSERT runs ahead of the primary-key conflict check, so a retried
-- adjustment (same id) is skipped here and left to ON CONFLICT DO NOTHING.
CREATE TRIGGER `stock_adjustment_keeps_stock_non_negative`
BEFORE INSERT ON `stock_adjustment`
WHEN NOT EXISTS (SELECT 1 FROM `stock_adjustment` WHERE `id` = NEW.`id`)
	AND COALESCE((SELECT SUM(`delta`) FROM `stock_adjustment` WHERE `prize_id` = NEW.`prize_id`), 0)
		+ NEW.`delta`
		- (SELECT COUNT(*) FROM `draw` WHERE `prize_id` = NEW.`prize_id`) < 0
BEGIN
	SELECT RAISE(ABORT, 'stock adjustment would make prize stock negative');
END;--> statement-breakpoint
CREATE TRIGGER `draw_requires_stock`
BEFORE INSERT ON `draw`
WHEN NEW.`prize_id` IS NOT NULL
	AND COALESCE((SELECT SUM(`delta`) FROM `stock_adjustment` WHERE `prize_id` = NEW.`prize_id`), 0)
		- (SELECT COUNT(*) FROM `draw` WHERE `prize_id` = NEW.`prize_id`) <= 0
BEGIN
	SELECT RAISE(ABORT, 'prize is out of stock');
END;
