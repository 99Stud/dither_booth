CREATE TABLE `lottery_preset` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`lines_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lottery_session` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text,
	`started_at` text DEFAULT (datetime('now')) NOT NULL,
	`ended_at` text
);
--> statement-breakpoint
ALTER TABLE `lottery_config` ADD `current_session_id` integer REFERENCES lottery_session(id);--> statement-breakpoint
ALTER TABLE `lottery_event` ADD `session_id` integer REFERENCES lottery_session(id);--> statement-breakpoint
INSERT INTO `lottery_session` (`id`, `title`, `started_at`, `ended_at`) VALUES (1, 'Historique importé', '2020-01-01T00:00:00.000Z', datetime('now'));--> statement-breakpoint
UPDATE `lottery_event` SET `session_id` = 1 WHERE `session_id` IS NULL;