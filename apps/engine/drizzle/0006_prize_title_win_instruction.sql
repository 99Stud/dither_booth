PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_prize` (
	`id` text PRIMARY KEY NOT NULL,
	`lottery_id` text NOT NULL,
	`title` text NOT NULL,
	`win_instruction` text NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`total_quantity` integer DEFAULT 0 NOT NULL,
	`remaining_quantity` integer DEFAULT 0 NOT NULL,
	`rarity` text DEFAULT 'common' NOT NULL,
	FOREIGN KEY (`lottery_id`) REFERENCES `lottery`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prize_weight_check" CHECK("weight" > 0),
	CONSTRAINT "prize_total_quantity_check" CHECK("total_quantity" >= 0),
	CONSTRAINT "prize_remaining_quantity_check" CHECK("remaining_quantity" between 0 and "total_quantity")
);
--> statement-breakpoint
INSERT INTO `__new_prize`("id", "lottery_id", "title", "win_instruction", "weight", "total_quantity", "remaining_quantity", "rarity") SELECT "id", "lottery_id", "win_description", 'Présentez ce ticket au bar', "weight", "total_quantity", "remaining_quantity", "rarity" FROM `prize`;--> statement-breakpoint
DROP TABLE `prize`;--> statement-breakpoint
ALTER TABLE `__new_prize` RENAME TO `prize`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
