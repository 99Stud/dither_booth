export const DARKROOM_LOG_SOURCE = "engine.darkroom";

/** A token dies after this long without being used. */
export const DARKROOM_TOKEN_IDLE_TTL_MS = 30 * 60_000;

/** Wrong PINs in a row before unlocking pauses. */
export const DARKROOM_MAX_FAILED_UNLOCKS = 5;

/** How long unlocking pauses after too many wrong PINs. */
export const DARKROOM_LOCKOUT_MS = 60_000;
