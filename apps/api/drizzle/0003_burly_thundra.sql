PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_draw` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`lottery_id` text,
	`prize_id` text,
	FOREIGN KEY (`lottery_id`) REFERENCES `lottery`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prize_id`) REFERENCES `prize`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_draw`("id", "created_at", "lottery_id", "prize_id") SELECT "id", "created_at", "lottery_id", "prize_id" FROM `draw`;--> statement-breakpoint
DROP TABLE `draw`;--> statement-breakpoint
ALTER TABLE `__new_draw` RENAME TO `draw`;--> statement-breakpoint
PRAGMA foreign_keys=ON;