PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_lottery` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`no_win_weight` real DEFAULT 1 NOT NULL,
	`win_cooldown_minutes` integer DEFAULT 5 NOT NULL,
	`print_loser_ticket` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "lottery_no_win_weight_check" CHECK("no_win_weight" >= 0),
	CONSTRAINT "lottery_win_cooldown_minutes_check" CHECK("win_cooldown_minutes" >= 0),
	CONSTRAINT "lottery_print_loser_ticket_check" CHECK("print_loser_ticket" in (0, 1))
);
--> statement-breakpoint
INSERT INTO `__new_lottery`("id", "enabled", "no_win_weight", "win_cooldown_minutes", "print_loser_ticket") SELECT "id", "enabled", "no_win_weight", "win_cooldown_minutes", 0 FROM `lottery`;--> statement-breakpoint
DROP TABLE `lottery`;--> statement-breakpoint
ALTER TABLE `__new_lottery` RENAME TO `lottery`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
