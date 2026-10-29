/*
 * Shared by the admin server and the System page: keep this file free of
 * server-only imports.
 */

/** The Power panel's route on the admin server. */
export const POWER_ROUTE_PATH = "/admin/power";

/** How often the page asks whether the admin answers again. */
export const POWER_POLL_INTERVAL_MS = 2_000;

/**
 * Powered off once the admin hasn't answered for this long: it is among
 * the first things the Pi stops on its way down.
 */
export const POWER_OFF_SILENCE_MS = 10_000;

/** A restart or reboot that hasn't answered again by now needs a look. */
export const POWER_BACK_TIMEOUT_MS = 5 * 60_000;
