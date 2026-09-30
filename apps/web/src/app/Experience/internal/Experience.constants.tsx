import type { InteractiveBackgroundOptions } from "#components/misc/InteractiveBackground/index";

/**
 * Fluid simulation budget the kiosk hardware sustains at full screen. `satisfies`
 * rather than a bare object so a mistyped nested key fails to compile — the
 * options prop takes a variable, which skips excess property checking.
 */
export const KIOSK_INTERACTIVE_BACKGROUND_OPTIONS = {
  fluidBackground: {
    simRes: 128,
    dyeRes: 512,
    iterations: 2,
    idleFrames: 240,
  },
} satisfies InteractiveBackgroundOptions;

export const COUNTDOWN_START = 3;

export const COUNTDOWN_INTERVAL_MS = 1000;
export const SMILE_HOLD_MS = 1000;
export const PHASE_AUTO_ADVANCE_MS = 5000;

/**
 * Escape hatch for a capture or print that never settles. Capture and print
 * each get a fresh budget, so the worst-case wait is two of these.
 *
 * The print half is the contract the API is bounded against. Bounded there:
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
