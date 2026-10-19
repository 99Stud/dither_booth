export const PRINTER_INITIALIZE_COMMAND = Buffer.from([0x1b, 0x40]);

/**
 * A ~1400-dot-tall receipt at 576 dots wide is ~100KB of GS v 0 payload and
 * ~175mm of paper at 203dpi, so a healthy flush lands in single-digit seconds.
 * Kept low enough that open + flush stays inside the shutter client's per-phase
 * print budget — see PRINT_ATTEMPT_TIMEOUT_MS.
 */
export const PRINTER_FLUSH_TIMEOUT_MS = 20_000;

/**
 * Send the raster the way Epson's macOS filter does: 256-row bands, each
 * stored with GS 8 L and then printed whole with GS ( L, instead of one long
 * GS v 0. Off until a printed comparison shows it removes stutter lines on
 * long receipts.
 */
export const PRINT_RASTER_IN_GRAPHICS_BANDS = false;

export const GRAPHICS_BAND_HEIGHT_DOTS = 256;
