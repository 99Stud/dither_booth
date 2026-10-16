/** How often the booth screen's mode is checked while a switch is on its way. */
export const BOOTH_MODE_SWITCHING_POLL_MS = 3_000;
export const BOOTH_MODE_POLL_MS = 30_000;

/**
 * How long a switch shows as on its way before the tiles fall back to what
 * the screen reports: the photo booth waits up to 90 s for a guest to finish.
 */
export const BOOTH_MODE_SWITCH_TIMEOUT_MS = 100_000;
