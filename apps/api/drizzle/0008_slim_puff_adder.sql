CREATE TABLE `item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`qty` integer NOT NULL,
	`price` real NOT NULL,
	CONSTRAINT "item_qty_check" CHECK("item"."qty" >= 1),
	CONSTRAINT "item_price_check" CHECK("item"."price" >= 0)
);
--> statement-breakpoint
INSERT INTO `item` (`label`, `qty`, `price`) VALUES ('99Stud', 1, 100);
--> statement-breakpoint
INSERT INTO `item` (`label`, `qty`, `price`) VALUES ('El Tony Mate', 1, 100);
--> statement-breakpoint
INSERT INTO `item` (`label`, `qty`, `price`) VALUES ('Ginette', 1, 100);
