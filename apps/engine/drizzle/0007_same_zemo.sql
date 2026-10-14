ALTER TABLE `draw` ADD `ticket_ref` text;--> statement-breakpoint
CREATE UNIQUE INDEX `draw_ticket_ref_unique` ON `draw` (`ticket_ref`);