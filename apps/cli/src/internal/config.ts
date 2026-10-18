// Replaced at compile time by `scripts/build.ts` with the release tag's
// version. Running from source (`bun src/index.ts`) leaves it undefined.
declare const BOOTH_CLI_VERSION: string | undefined;

export const CLI_VERSION =
  typeof BOOTH_CLI_VERSION === "string" ? BOOTH_CLI_VERSION : "0.0.0-dev";

export const DEFAULT_REPO_ROOT = "/opt/dither-booth";
export const REPO_GIT_URL =
  process.env.BOOTH_REPO_URL ?? "https://github.com/99Stud/dither_booth.git";

export const SSD_MOUNT_POINT = "/mnt/ssd";
export const SSD_BOOTH_DIR = `${SSD_MOUNT_POINT}/dither-booth`;
export const SSD_DATA_DIR = `${SSD_BOOTH_DIR}/data`;
export const ENGINE_APP_RELATIVE = "apps/engine";
export const ENGINE_DATA_RELATIVE = `${ENGINE_APP_RELATIVE}/data`;

export const SERVICE_NAME = "ditherbooth.service";
export const SERVICE_PATH = `/etc/systemd/system/${SERVICE_NAME}`;
export const SERVICE_USER = process.env.BOOTH_SERVICE_USER ?? "pi";
export const SERVICE_HOME = `/home/${SERVICE_USER}`;
// Where the official installer puts Bun for the service user. The systemd unit
// runs this binary, so every step resolves Bun here instead of from PATH.
export const SERVICE_BUN_DIR = `${SERVICE_HOME}/.bun/bin`;
export const SERVICE_BUN = `${SERVICE_BUN_DIR}/bun`;

export const PM2_PROCESS_NAMES = [
  "dither-booth-engine",
  "dither-booth-admin",
  "dither-booth-shutter",
] as const;

// Compiled binaries cannot derive the repo from import.meta.url, so the repo
// root is resolved explicitly from the environment with a fixed default.
export function resolveRepoRoot(): string {
  const fromEnv = process.env.BOOTH_REPO?.trim();

  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_REPO_ROOT;
}
