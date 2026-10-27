/** Where browsers send their warnings and errors, on the server that served the page. */
export const CLIENT_LOG_ROUTE_PATH = "/client-log";

/** Largest report body the server reads, in bytes. */
export const CLIENT_LOG_MAX_BODY_BYTES = 16 * 1024;

/** Reports one device may send per window before the server refuses them. */
export const CLIENT_LOG_RATE_LIMIT = 30;

/** The rate limit window, in milliseconds. */
export const CLIENT_LOG_RATE_WINDOW_MS = 60_000;

/** How much of an error's stack a report keeps when the whole report is too big. */
export const CLIENT_LOG_TRIMMED_STACK_LENGTH = 4096;

/** How much of an error's message or cause a report keeps when it is too big. */
export const CLIENT_LOG_TRIMMED_TEXT_LENGTH = 1024;
