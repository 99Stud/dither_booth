import { resolve } from "node:path";

import { ENGINE_APP_ROOT } from "#lib/constants";

export const LOGO_LIBRARY_LOG_SOURCE = "engine.logo-library";

/** Added logos live next to the database, on the booth's SSD. */
export const LOGO_ASSETS_DIR = resolve(ENGINE_APP_ROOT, "data/logos");

/**
 * The partner row's box is 72 CSS px tall and the ticket is screenshot at
 * 2×, so a logo is kept at most this tall and is never scaled up on paper.
 */
export const LOGO_MAX_HEIGHT_PX = 144;

/** The ticket's 576 dots less its margins, at the screenshot's 2×. */
export const LOGO_MAX_WIDTH_PX = 1088;

/** Every PNG file starts with these eight bytes. */
export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
