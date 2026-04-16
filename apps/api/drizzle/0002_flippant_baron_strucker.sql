CREATE TABLE `lottery_config` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`start_time` text DEFAULT '16:00' NOT NULL,
	`end_time` text DEFAULT '21:00' NOT NULL,
	`base_win_pressure` real DEFAULT 0.15 NOT NULL,
	`max_boost` real DEFAULT 3 NOT NULL,
	`lookback_minutes` integer DEFAULT 30 NOT NULL,
	`abuse_window_seconds` integer DEFAULT 60 NOT NULL,
	`abuse_max_attempts` integer DEFAULT 5 NOT NULL,
	`abuse_min_interval_seconds` integer DEFAULT 10 NOT NULL,
	`abuse_cooldown_seconds` integer DEFAULT 120 NOT NULL,
	CONSTRAINT "lottery_config_singleton_check" CHECK("lottery_config"."id" = 1),
	CONSTRAINT "lottery_config_base_win_pressure_check" CHECK("lottery_config"."base_win_pressure" between 0 and 1),
	CONSTRAINT "lottery_config_max_boost_check" CHECK("lottery_config"."max_boost" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE `lottery_event` (
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
CREATE TABLE `lottery_lot` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`stock_total` integer NOT NULL,
	`stock_remaining` integer NOT NULL,
	`base_weight` real DEFAULT 1 NOT NULL,
	`rarity` text DEFAULT 'common' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "lottery_lot_stock_remaining_check" CHECK("lottery_lot"."stock_remaining" >= 0),
	CONSTRAINT "lottery_lot_stock_total_check" CHECK("lottery_lot"."stock_total" >= 1),
	CONSTRAINT "lottery_lot_base_weight_check" CHECK("lottery_lot"."base_weight" > 0)
);
