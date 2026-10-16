import { resolve } from "node:path";

import { ENGINE_APP_ROOT } from "#lib/constants";

export const FONT_LIBRARY_LOG_SOURCE = "engine.font-library";

/** Added fonts live next to the database, on the booth's SSD. */
export const FONT_ASSETS_DIR = resolve(ENGINE_APP_ROOT, "data/fonts");

/** Google Fonts, served by Fontsource; no API key. */
export const FONTSOURCE_API = "https://api.fontsource.org/v1/fonts";

/** The only hosts a font file is downloaded from. */
export const FONT_DOWNLOAD_HOSTS = ["cdn.jsdelivr.net"] as const;

/** A latin woff2 is tens of kilobytes; anything near this is not a font. */
export const MAX_FONT_FILE_BYTES = 2 * 1024 * 1024;

/** Every woff2 file starts with these four bytes. */
export const WOFF2_SIGNATURE = "wOF2";

/** The weights installed from the library, when the family has them. */
export const LIBRARY_FONT_WEIGHTS = [400, 700] as const;

export const FONT_SEARCH_LIMIT = 24;
