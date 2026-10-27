ALTER TABLE `draw` ADD `prize_title` text;--> statement-breakpoint
UPDATE `draw` SET `prize_title` = (SELECT `title` FROM `prize` WHERE `prize`.`id` = `draw`.`prize_id`) WHERE `prize_id` IS NOT NULL;
