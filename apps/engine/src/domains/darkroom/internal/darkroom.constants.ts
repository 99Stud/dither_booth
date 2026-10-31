export const DARKROOM_LOG_SOURCE = "engine.darkroom";

/** A token dies after this long without being used. */
export const DARKROOM_TOKEN_IDLE_TTL_MS = 30 * 60_000;

/** Wrong PINs in a row before unlocking pauses. */
export const DARKROOM_MAX_FAILED_UNLOCKS = 5;

/**
 * How long unlocking pauses after the first run of wrong PINs. Each later
 * run doubles it, up to `DARKROOM_MAX_LOCKOUT_MS`; the right PIN resets it.
 * The PIN opens admin too, so 5 guesses a minute would be too many.
 */
export const DARKROOM_LOCKOUT_MS = 60_000;

/** The longest pause: 5 guesses per 15 minutes once someone keeps trying. */
export const DARKROOM_MAX_LOCKOUT_MS = 15 * 60_000;
