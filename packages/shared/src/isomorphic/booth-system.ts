/*
 * Names on the booth's system that more than one app uses: the CLI
 * installs them, the admin reads their logs.
 */

/** The systemd unit that runs PM2 and the apps. */
export const BOOTH_SERVICE_UNIT = "ditherbooth.service";

/** The systemd unit that runs the network watch. */
export const BOOTH_NETWORK_SERVICE_UNIT = "ditherbooth-network.service";

/**
 * Where PM2 writes one combined `<process>.log` per process, relative to
 * the repo. Must match `pm2LogDir` in `pm2.config.js`, which PM2 loads
 * without the workspace.
 */
export const PM2_LOG_RELATIVE_DIR = "logs/pm2";
