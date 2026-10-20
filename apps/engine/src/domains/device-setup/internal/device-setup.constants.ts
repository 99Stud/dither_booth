export const DEVICE_SETUP_LOG_SOURCE = "engine.device-setup";

/** Where the engine remembers which boot and address it last printed a setup ticket for. */
export const SETUP_TICKET_KEY_PATH = ".local/device-setup/last-ticket";

/** Linux's id for the current boot: a PM2 restart keeps it, a power cycle doesn't. */
export const BOOT_ID_PATH = "/proc/sys/kernel/random/boot_id";

/** Gives up on a ticket that keeps failing, so a faulty printer doesn't loop. */
export const SETUP_TICKET_MAX_ATTEMPTS = 3;
/** How often the booth checks whether its network changed. */
export const SETUP_TICKET_POLL_MS = 5_000;
