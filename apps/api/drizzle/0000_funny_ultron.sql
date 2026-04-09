CREATE TABLE `print_debug_config` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`dither_mode_code` integer DEFAULT 2 NOT NULL,
	`brightness` real DEFAULT 1 NOT NULL,
	`contrast` real DEFAULT 1 NOT NULL,
	`gamma` real DEFAULT 1 NOT NULL,
	`threshold` real DEFAULT 128 NOT NULL,
	CONSTRAINT "print_debug_config_singleton_check" CHECK("print_debug_config"."id" = 1),
	CONSTRAINT "print_debug_config_dither_mode_code_check" CHECK("print_debug_config"."dither_mode_code" between 0 and 8),
	CONSTRAINT "print_debug_config_brightness_step_check" CHECK("print_debug_config"."brightness" between 0 and 3),
	CONSTRAINT "print_debug_config_contrast_step_check" CHECK("print_debug_config"."contrast" between 0 and 3),
	CONSTRAINT "print_debug_config_gamma_step_check" CHECK("print_debug_config"."gamma" between 1 and 3),
	CONSTRAINT "print_debug_config_threshold_check" CHECK("print_debug_config"."threshold" between 0 and 255)
);
