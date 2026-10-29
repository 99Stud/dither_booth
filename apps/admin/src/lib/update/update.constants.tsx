/*
 * Shared by the admin server and the System page: keep this file free of
 * server-only imports.
 */

/** The Software panel's route on the admin server. */
export const UPDATE_ROUTE_PATH = "/admin/update";

/** How often the admin server asks GitHub for the latest release. */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60_000;

/** How often the page reads the snapshot while a job runs. */
export const UPDATE_POLL_ACTIVE_MS = 3_000;
/** And otherwise: a new release is news, not an alarm. */
export const UPDATE_POLL_IDLE_MS = 60_000;

/** A job that ended this recently still shows its result on the panel. */
export const UPDATE_RESULT_SHOWN_MS = 30 * 60_000;
