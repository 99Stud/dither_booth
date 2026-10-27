/*
 * Names on the booth's system that more than one app uses: the CLI
 * installs them, the admin reads their logs.
 */

/** The systemd unit that runs PM2 and the apps. */
export const BOOTH_SERVICE_UNIT = "ditherbooth.service";

/** The systemd unit that runs the network watch. */
export const BOOTH_NETWORK_SERVICE_UNIT = "ditherbooth-network.service";

/**
 * Each service's PM2 process. `pm2.config.js` repeats them, because PM2
 * loads it without the workspace; `booth-system.test.ts` keeps the two equal.
 */
export const PM2_PROCESS_NAMES = {
  engine: "dither-booth-engine",
  admin: "dither-booth-admin",
  shutter: "dither-booth-shutter",
} as const;

/**
 * Where PM2 writes one combined `<process>.log` per process, relative to
 * the repo. `pm2.config.js` repeats it, checked by the same test.
 */
export const PM2_LOG_RELATIVE_DIR = "logs/pm2";
