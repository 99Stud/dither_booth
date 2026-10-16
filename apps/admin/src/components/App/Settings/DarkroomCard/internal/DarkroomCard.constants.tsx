/** How often the kiosk's screen is checked while a switch is on its way. */
export const KIOSK_SCREEN_SWITCHING_POLL_MS = 3_000;
export const KIOSK_SCREEN_POLL_MS = 30_000;

/**
 * How long a switch shows as on its way before the tiles fall back to what
 * the kiosk reports: the Shutter waits up to 90 s for a visit to end.
 */
export const KIOSK_SCREEN_SWITCH_TIMEOUT_MS = 100_000;
