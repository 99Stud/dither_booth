ALTER TABLE `lottery_config` ADD `session_active` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `lottery_config` ADD `session_started_at` text;--> statement-breakpoint
ALTER TABLE `lottery_config` ADD `last_session_ended_at` text;