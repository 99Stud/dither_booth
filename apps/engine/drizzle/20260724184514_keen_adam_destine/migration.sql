PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_print_config` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`dither_mode_code` integer DEFAULT 1 NOT NULL,
	`color_scheme_code` integer DEFAULT 0 NOT NULL,
	`serpentine` integer DEFAULT true NOT NULL,
	`exposure` real DEFAULT 1 NOT NULL,
	`saturation` real DEFAULT 1 NOT NULL,
	`shadows` real DEFAULT 0 NOT NULL,
	`highlights` real DEFAULT 0 NOT NULL,
	`threshold` integer DEFAULT 128 NOT NULL,
	`rotation` integer DEFAULT 0 NOT NULL,
	`template` text DEFAULT 'tartines' NOT NULL,
	CONSTRAINT "print_config_singleton_check" CHECK("id" = 1),
	CONSTRAINT "print_config_dither_mode_code_check" CHECK("dither_mode_code" between 0 and 9),
	CONSTRAINT "print_config_color_scheme_code_check" CHECK("color_scheme_code" in (0, 5, 6, 9)),
	CONSTRAINT "print_config_serpentine_check" CHECK("serpentine" in (0, 1)),
	CONSTRAINT "print_config_exposure_check" CHECK("exposure" > 0 and "exposure" <= 4),
	CONSTRAINT "print_config_saturation_check" CHECK("saturation" between 0 and 4),
	CONSTRAINT "print_config_shadows_check" CHECK("shadows" between 0 and 1),
	CONSTRAINT "print_config_highlights_check" CHECK("highlights" between 0 and 1),
	CONSTRAINT "print_config_threshold_check" CHECK("threshold" between 0 and 255),
	CONSTRAINT "print_config_rotation_check" CHECK("rotation" between 0 and 360),
	CONSTRAINT "print_config_template_check" CHECK("template" in ('tartines', 'heirvey'))
);
--> statement-breakpoint
INSERT INTO `__new_print_config`("id", "dither_mode_code", "color_scheme_code", "serpentine", "exposure", "saturation", "shadows", "highlights", "threshold", "rotation", "template") SELECT "id", "dither_mode_code", CASE WHEN "color_scheme_code" = 7 THEN 9 ELSE "color_scheme_code" END, "serpentine", "exposure", "saturation", "shadows", "highlights", "threshold", "rotation", "template" FROM `print_config`;--> statement-breakpoint
DROP TABLE `print_config`;--> statement-breakpoint
ALTER TABLE `__new_print_config` RENAME TO `print_config`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
