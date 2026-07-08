export const CLI_VERSION = "0.1.0";

export const DEFAULT_REPO_ROOT = "/opt/dither-booth";
export const REPO_GIT_URL =
  process.env.BOOTH_REPO_URL ?? "https://github.com/99stud/dither_booth.git";

export const SSD_MOUNT_POINT = "/mnt/ssd";
export const SSD_DATA_DIR = `${SSD_MOUNT_POINT}/dither-booth/data`;
export const API_DATA_RELATIVE = "apps/api/data";

export const SERVICE_NAME = "ditherbooth.service";
export const SERVICE_PATH = `/etc/systemd/system/${SERVICE_NAME}`;
export const SERVICE_USER = process.env.BOOTH_SERVICE_USER ?? "pi";

export const PM2_PROCESS_NAMES = [
  "dither-booth-api",
  "dither-booth-admin",
  "dither-booth-web",
] as const;

// Compiled binaries cannot derive the repo from import.meta.url, so the repo
// root is resolved explicitly from the environment with a fixed default.
export function resolveRepoRoot(): string {
  const fromEnv = process.env.BOOTH_REPO?.trim();

  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_REPO_ROOT;
}
