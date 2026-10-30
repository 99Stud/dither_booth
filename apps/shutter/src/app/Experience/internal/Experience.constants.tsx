export const COUNTDOWN_START = 3;

export const COUNTDOWN_INTERVAL_MS = 1000;
export const SMILE_HOLD_MS = 1000;
/** How long the win/lose row stays on screen before the reels clear. */
export const SLOT_RESULT_HOLD_MS = 1500;
/**
 * How long the claim text stays up before the ticket starts printing. Short:
 * the claim stays on screen while the ticket prints.
 */
export const INSTRUCTIONS_HOLD_MS = 1500;

/**
 * Slot machine geometry, sized for the iPad Pro 11" kiosk in landscape
 * (1194x834 CSS px). Photo and panel are the same square: the camera box
 * scaled down, then centered as a pair with a gap between them.
 */
export const FROZEN_PHOTO_SCALE = 0.68;
export const SPLIT_TILE_GAP_PX = 48;
export const REEL_CELL_WIDTH_PX = 128;
export const REEL_CELL_HEIGHT_PX = 160;
export const PHASE_AUTO_ADVANCE_MS = 5000;

/**
 * How long a "when idle" command from the operator (a reload, opening the
 * Darkroom) waits for the landing screen before running anyway, in case the
 * flow is stuck.
 */
export const KIOSK_RELOAD_IDLE_TIMEOUT_MS = 90_000;

/** Taps on the landing screen's top-left logo that open the Darkroom. */
export const DARKROOM_HOTSPOT_TAPS = 4;

/** The taps must all land within this window, so stray guest taps reset. */
export const DARKROOM_HOTSPOT_WINDOW_MS = 2000;

/**
 * Escape hatch for a capture or print that never settles. Capture and print
 * each get a fresh budget, so the worst-case wait is two of these.
 *
 * The print half is the contract the engine is bounded against. Bounded there:
 * receipt screenshot (12s) + printer open (5s) + flush (20s) = 37s, leaving 8s.
 * Raising any of those without raising this one lets the kiosk reset while a
 * receipt is still on its way to the printer.
 *
 * That 8s is not pure slack — it also absorbs the stages that stay unbounded:
 * the sharp dither, PNG encode and raster conversion. Those are CPU-bound on a
 * bounded-size webcam frame and run in well under a second, so they are not a
 * hang risk, but they are real time this budget has to cover. The queue waits
 * for the shared puppeteer page and the printer are unbounded too; see
 * runExclusivePrinterJob for why that gap is left open.
 */
export const PRINT_ATTEMPT_TIMEOUT_MS = 45000;

/**
 * A failed print is retried this many times before the visit fails. The engine
 * keeps the prepared job across failures and only prints the parts that did
 * not come out (photo, then lottery ticket), so a retry never duplicates one.
 * Retries share the printing phase's PRINT_ATTEMPT_TIMEOUT_MS budget.
 */
export const PRINT_PREPARED_RECEIPT_RETRIES = 2;
export const PRINT_PREPARED_RECEIPT_RETRY_DELAY_MS = 2000;
