CREATE TABLE `visit` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text,
	`hub_event_id` text,
	`started_at` integer NOT NULL,
	`captured_at` integer,
	`draw_id` text,
	`printed_at` integer,
	`print_attempts` integer DEFAULT 0 NOT NULL,
	`ended_at` integer,
	`end_reason` text,
	`updated_at` integer NOT NULL,
	`reported_at` integer,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`draw_id`) REFERENCES `draw`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "visit_end_reason_check" CHECK("visit"."end_reason" in ('completed', 'abandoned', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `visit_draw_id_unique` ON `visit` (`draw_id`);--> statement-breakpoint
CREATE INDEX `visit_campaign_id_idx` ON `visit` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `visit_pending_idx` ON `visit` (`reported_at`,`updated_at`);--> statement-breakpoint
-- Backfill: one completed visit per draw recorded before visits existed, so
-- an event's counts include its earlier guests. Ids are deterministic, like
-- 0011's stock backfill. A draw only knows one time, so these visits have no
-- duration (`visit.stats.ts` leaves them out of the average).
INSERT INTO `visit` (`id`, `campaign_id`, `started_at`, `captured_at`, `draw_id`, `printed_at`, `print_attempts`, `ended_at`, `end_reason`, `updated_at`)
SELECT
	'backfill-' || `id`,
	`campaign_id`,
	`created_at`,
	`created_at`,
	`id`,
	`created_at`,
	1,
	`created_at`,
	'completed',
	`created_at`
FROM `draw`;
