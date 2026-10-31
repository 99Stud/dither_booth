/*
 * Shared by the admin server and the page: keep this file free of
 * server-only imports.
 */

/** Where the page signs in (POST, the PIN) and out (DELETE). */
export const STAFF_SESSION_ROUTE_PATH = "/admin/session";

/**
 * The HttpOnly cookie that holds the staff token. The page never reads it;
 * the admin server turns it into `x-darkroom-token` for the engine.
 */
export const STAFF_SESSION_COOKIE = "dither_staff";

/**
 * While the engine doesn't answer, a token it confirmed this recently still
 * opens the admin server's own routes, so staff can read the logs and
 * restart the apps. Matches the engine's idle expiry.
 */
export const STAFF_SESSION_OFFLINE_TTL_MS = 30 * 60_000;

/** What the admin server answers a route the staff PIN hasn't opened. */
export const STAFF_SESSION_REQUIRED_MESSAGE = "Sign in with the staff PIN.";
