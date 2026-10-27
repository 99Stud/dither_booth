ALTER TABLE `campaign` ADD `kit_id` text;--> statement-breakpoint
-- The receipt template was a device-wide setting until now, and 0015 drops
-- it. Every existing event takes it as its kit, so it keeps printing the same
-- look even after the release's default kit changes.
UPDATE `campaign` SET `kit_id` = (SELECT `template` FROM `print_config` WHERE `id` = 1);
