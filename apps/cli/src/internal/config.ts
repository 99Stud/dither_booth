import {
  BOOTH_NETWORK_SERVICE_UNIT,
  BOOTH_SERVICE_UNIT,
} from "@dither-booth/shared/booth-system";
import {
  BOOTH_RELEASES_REPO,
  BOOTH_ROLLBACK_UNIT_TEMPLATE,
  BOOTH_UPDATE_UNIT_TEMPLATE,
} from "@dither-booth/shared/booth-update";

// Replaced at compile time by `scripts/build.ts` with the release tag's
// version. Running from source (`bun src/index.ts`) leaves it undefined.
declare const BOOTH_CLI_VERSION: string | undefined;

export const CLI_VERSION =
  typeof BOOTH_CLI_VERSION === "string" ? BOOTH_CLI_VERSION : "0.0.0-dev";

export const DEFAULT_REPO_ROOT = "/opt/dither-booth";
/** The GitHub repository `booth update` installs releases from. */
export const RELEASES_REPO =
  process.env.BOOTH_RELEASES_REPO ?? BOOTH_RELEASES_REPO;
export const REPO_GIT_URL =
  process.env.BOOTH_REPO_URL ?? "https://github.com/99Stud/dither_booth.git";

export const SSD_MOUNT_POINT = "/mnt/ssd";
export const SSD_BOOTH_DIR = `${SSD_MOUNT_POINT}/dither-booth`;
export const SSD_DATA_DIR = `${SSD_BOOTH_DIR}/data`;
export const ENGINE_APP_RELATIVE = "apps/engine";
export const ENGINE_DATA_RELATIVE = `${ENGINE_APP_RELATIVE}/data`;
export const ENGINE_DB_FILE = "dither-booth.sqlite";
export const ENGINE_DB_RELATIVE = `${ENGINE_DATA_RELATIVE}/${ENGINE_DB_FILE}`;

export const SERVICE_NAME = BOOTH_SERVICE_UNIT;
export const SERVICE_PATH = `/etc/systemd/system/${SERVICE_NAME}`;
export const NETWORK_SERVICE_NAME = BOOTH_NETWORK_SERVICE_UNIT;
/** Where install.sh puts the CLI; the service unit calls it at boot. */
export const BOOTH_BIN = "/usr/local/bin/booth";
/** Restarts the booth when the network gives it a new address. */
export const NETWORK_DISPATCHER_PATH =
  "/etc/NetworkManager/dispatcher.d/90-ditherbooth";
/** Rotates the PM2 log folder; logrotate runs it every hour (drop-in below). */
export const LOGROTATE_RULE_PATH = "/etc/logrotate.d/ditherbooth";
/** A PM2 log past this many MB is rotated at logrotate's next run. */
export const LOGROTATE_MAX_SIZE_MB = 20;
/** Makes Debian's daily logrotate.timer hourly, so the size cap holds. */
export const LOGROTATE_TIMER_DROP_IN_PATH =
  "/etc/systemd/system/logrotate.timer.d/ditherbooth.conf";
/** Run `booth update <version>` and `booth rollback` as root for the admin. */
export const UPDATE_UNIT_PATH = `/etc/systemd/system/${BOOTH_UPDATE_UNIT_TEMPLATE}`;
export const ROLLBACK_UNIT_PATH = `/etc/systemd/system/${BOOTH_ROLLBACK_UNIT_TEMPLATE}`;
/** Lets the admin restart the apps, reboot, power off, update and roll back. */
export const SYSTEM_POLKIT_RULE_PATH =
  "/etc/polkit-1/rules.d/50-ditherbooth-system.rules";
/** Members read the whole system journal; the admin's Logs page needs it. */
export const JOURNAL_GROUP = "systemd-journal";
export const SERVICE_USER = process.env.BOOTH_SERVICE_USER ?? "pi";
export const SERVICE_HOME = `/home/${SERVICE_USER}`;
// Where the official installer puts Bun for the service user. The systemd unit
// runs this binary, so every step resolves Bun here instead of from PATH.
export const SERVICE_BUN_DIR = `${SERVICE_HOME}/.bun/bin`;
export const SERVICE_BUN = `${SERVICE_BUN_DIR}/bun`;

// Compiled binaries cannot derive the repo from import.meta.url, so the repo
// root is resolved explicitly from the environment with a fixed default.
export function resolveRepoRoot(): string {
  const fromEnv = process.env.BOOTH_REPO?.trim();

  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_REPO_ROOT;
}
