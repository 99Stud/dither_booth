DROP TABLE `lottery_session`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_lottery_config` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`start_time` text DEFAULT '16:00' NOT NULL,
	`end_time` text DEFAULT '21:00' NOT NULL,
	`base_win_pressure` real DEFAULT 0.15 NOT NULL,
	`max_boost` real DEFAULT 3 NOT NULL,
	`abuse_window_seconds` integer DEFAULT 60 NOT NULL,
	`abuse_max_attempts` integer DEFAULT 5 NOT NULL,
	`abuse_min_interval_seconds` integer DEFAULT 10 NOT NULL,
	`abuse_cooldown_seconds` integer DEFAULT 120 NOT NULL,
	CONSTRAINT "lottery_config_singleton_check" CHECK("id" = 1),
	CONSTRAINT "lottery_config_base_win_pressure_check" CHECK("base_win_pressure" between 0 and 1),
	CONSTRAINT "lottery_config_max_boost_check" CHECK("max_boost" between 1 and 10)
);
--> statement-breakpoint
INSERT INTO `__new_lottery_config`("id", "enabled", "start_time", "end_time", "base_win_pressure", "max_boost", "abuse_window_seconds", "abuse_max_attempts", "abuse_min_interval_seconds", "abuse_cooldown_seconds") SELECT "id", "enabled", "start_time", "end_time", "base_win_pressure", "max_boost", "abuse_window_seconds", "abuse_max_attempts", "abuse_min_interval_seconds", "abuse_cooldown_seconds" FROM `lottery_config`;--> statement-breakpoint
DROP TABLE `lottery_config`;--> statement-breakpoint
ALTER TABLE `__new_lottery_config` RENAME TO `lottery_config`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_lottery_event` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text DEFAULT (datetime('now')) NOT NULL,
	`outcome` text NOT NULL,
	`lot_id` integer,
	`abuse_detected` integer DEFAULT false NOT NULL,
	`computed_pressure` real,
	`computed_win_probability` real,
	`remaining_stock` integer,
	`elapsed_window_ratio` real,
	`capture_to_draw_ms` integer,
	FOREIGN KEY (`lot_id`) REFERENCES `lottery_lot`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_lottery_event`("id", "timestamp", "outcome", "lot_id", "abuse_detected", "computed_pressure", "computed_win_probability", "remaining_stock", "elapsed_window_ratio", "capture_to_draw_ms") SELECT "id", "timestamp", "outcome", "lot_id", "abuse_detected", "computed_pressure", "computed_win_probability", "remaining_stock", "elapsed_window_ratio", "capture_to_draw_ms" FROM `lottery_event`;--> statement-breakpoint
DROP TABLE `lottery_event`;--> statement-breakpoint
ALTER TABLE `__new_lottery_event` RENAME TO `lottery_event`;
