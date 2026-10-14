CREATE TABLE `campaign` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`lottery_id` text,
	FOREIGN KEY (`lottery_id`) REFERENCES `lottery`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `draw` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`lottery_id` text,
	`prize_id` text,
	FOREIGN KEY (`lottery_id`) REFERENCES `lottery`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prize_id`) REFERENCES `prize`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `lottery` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prize` (
	`id` text PRIMARY KEY NOT NULL,
	`lottery_id` text NOT NULL,
	`win_description` text NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`total_quantity` integer DEFAULT 0 NOT NULL,
	`remaining_quantity` integer DEFAULT 0 NOT NULL,
	`rarity` text DEFAULT 'common' NOT NULL,
	FOREIGN KEY (`lottery_id`) REFERENCES `lottery`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prize_weight_check" CHECK("prize"."weight" > 0),
	CONSTRAINT "prize_total_quantity_check" CHECK("prize"."total_quantity" >= 0),
	CONSTRAINT "prize_remaining_quantity_check" CHECK("prize"."remaining_quantity" between 0 and "prize"."total_quantity")
);
