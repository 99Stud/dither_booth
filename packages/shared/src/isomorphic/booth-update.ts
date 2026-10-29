import { z } from "zod";

/*
 * What `booth update` and `booth rollback` leave on the booth, shared by
 * the CLI that writes it and the admin that reads it. Root writes these
 * files; anyone can read them.
 */

/** Where releases are published: GitHub, `owner/name`. */
export const BOOTH_RELEASES_REPO = "99Stud/dither_booth";

export const BOOTH_UPDATE_STATE_DIR = "/var/lib/ditherbooth/update";
/** The job running now, or the last one. */
export const BOOTH_UPDATE_STATUS_PATH = `${BOOTH_UPDATE_STATE_DIR}/status.json`;
/** Finished jobs, newest first. */
export const BOOTH_UPDATE_HISTORY_PATH = `${BOOTH_UPDATE_STATE_DIR}/history.json`;
/** Kept in the history. */
export const BOOTH_UPDATE_HISTORY_LIMIT = 20;

/**
 * A release version as tags name it, without the `v`: `0.8.0`, or a
 * pre-release such as `0.8.0-rc.1`. Nothing else reaches a unit name or
 * a download URL.
 */
export const RELEASE_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/u;

export const isReleaseVersion = (value: string) =>
  RELEASE_VERSION_PATTERN.test(value);

/** In job order. `rollback` only runs when the check failed, or on request. */
export const BOOTH_UPDATE_STEPS = [
  "preflight",
  "cli",
  "download",
  "unpack",
  "setup",
  "backup",
  "switch",
  "restart",
  "check",
  "rollback",
] as const;

export const boothUpdateStepSchema = z.enum(BOOTH_UPDATE_STEPS);

export type BoothUpdateStep = z.infer<typeof boothUpdateStepSchema>;

export const boothUpdateJobSchema = z.object({
  kind: z.enum(["update", "rollback"]),
  jobId: z.string(),
  /** The release before the job; null on a booth that never ran one. */
  from: z.string().nullable(),
  to: z.string(),
  /**
   * `failed`: the booth still runs `from`. `rolled-back`: `to` didn't
   * start, and the booth went back to `from`.
   */
  state: z.enum(["running", "done", "failed", "rolled-back"]),
  step: boothUpdateStepSchema,
  startedAt: z.string(),
  updatedAt: z.string(),
  error: z.string().nullable(),
  /** The database as it was before the switch. */
  backup: z.string().nullable(),
  /** Whether `to` applied migrations: then `from` can't run on it as is. */
  migrated: z.boolean().nullable(),
});

export type BoothUpdateJob = z.infer<typeof boothUpdateJobSchema>;

export const boothUpdateHistorySchema = z.array(boothUpdateJobSchema);

/*
 * The units the admin starts, as root, through the booth's polkit rule.
 * systemd escapes `-` in an instance name as `\x2d`; the unit hands the
 * unescaped version (`%i`) to the CLI.
 */
export const BOOTH_UPDATE_UNIT_TEMPLATE = "ditherbooth-update@.service";
export const BOOTH_ROLLBACK_UNIT_TEMPLATE = "ditherbooth-rollback@.service";

/** How a rollback treats the database: keep it, or restore the backup. */
export const boothRollbackModeSchema = z.enum(["keep-db", "restore-db"]);

export type BoothRollbackMode = z.infer<typeof boothRollbackModeSchema>;

const escapeInstance = (value: string) => value.replaceAll("-", "\\x2d");

export function getBoothUpdateUnit(version: string): string {
  if (!isReleaseVersion(version)) {
    throw new Error(`Not a release version: ${version}`);
  }

  return `ditherbooth-update@${escapeInstance(version)}.service`;
}

export const getBoothRollbackUnit = (mode: BoothRollbackMode) =>
  `ditherbooth-rollback@${escapeInstance(mode)}.service`;

/**
 * Orders two release versions: negative when `a` is older. A pre-release
 * comes before its release (`0.8.0-rc.1` < `0.8.0`); pre-release parts
 * compare as numbers when both are.
 */
export function compareReleaseVersions(a: string, b: string): number {
  const split = (value: string) => {
    const [core = "", pre] = value.split(/-(.*)/su);
    return { core: core.split(".").map(Number), pre };
  };
  const left = split(a);
  const right = split(b);

  for (let index = 0; index < 3; index += 1) {
    const diff = (left.core[index] ?? 0) - (right.core[index] ?? 0);
    if (diff !== 0) return diff;
  }

  if (left.pre === undefined || right.pre === undefined) {
    return (left.pre === undefined ? 1 : 0) - (right.pre === undefined ? 1 : 0);
  }

  const leftParts = left.pre.split(".");
  const rightParts = right.pre.split(".");

  for (
    let index = 0;
    index < Math.max(leftParts.length, rightParts.length);
    index += 1
  ) {
    const l = leftParts[index];
    const r = rightParts[index];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const diff =
      /^\d+$/u.test(l) && /^\d+$/u.test(r)
        ? Number(l) - Number(r)
        : l.localeCompare(r);
    if (diff !== 0) return diff;
  }

  return 0;
}
