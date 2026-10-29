import { z } from "zod";

/*
 * What `booth update` and `booth rollback` leave on the booth, shared by
 * the CLI that writes it and the admin that reads it. Root writes these
 * files; anyone can read them.
 */

/** Where releases are published: GitHub, `owner/name`. */
export const BOOTH_RELEASES_REPO = "99Stud/dither_booth";

/** Room an update needs next to the releases: the download and the unpacked bundle, with margin. */
export const BOOTH_UPDATE_MIN_FREE_BYTES = 1024 ** 3;

export const BOOTH_UPDATE_STATE_DIR = "/var/lib/ditherbooth/update";
/** The job running now, or the last one. */
export const BOOTH_UPDATE_STATUS_PATH = `${BOOTH_UPDATE_STATE_DIR}/status.json`;
/** Finished jobs, newest first. */
export const BOOTH_UPDATE_HISTORY_PATH = `${BOOTH_UPDATE_STATE_DIR}/history.json`;
/** Where a rollback would go now, written after every job. */
export const BOOTH_ROLLBACK_TARGET_PATH = `${BOOTH_UPDATE_STATE_DIR}/rollback.json`;
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

/**
 * In job order. The booth serves guests up to `switch`; `setup` (the
 * units, polkit rules, network setup the release's CLI installs) runs
 * after it, so its restarts fold into the one at `restart`. `rollback`
 * only runs when something after the switch failed.
 */
export const BOOTH_UPDATE_STEPS = [
  "preflight",
  "cli",
  "download",
  "unpack",
  "backup",
  "switch",
  "setup",
  "restart",
  "check",
  "rollback",
] as const;

export const boothUpdateStepSchema = z.enum(BOOTH_UPDATE_STEPS);

export type BoothUpdateStep = z.infer<typeof boothUpdateStepSchema>;

/**
 * `@dither-booth/protocol`'s BOOTH_JOB_STATES, which the Hub reads; the
 * protocol package can't be imported here (it is zod-only, read by Deno),
 * so `booth-update.test.ts` keeps the two equal.
 */
export const BOOTH_JOB_STATES = [
  "running",
  "done",
  "failed",
  "rolled-back",
] as const;

export const boothJobStateSchema = z.enum(BOOTH_JOB_STATES);
 * One process, told apart from a later one that got its pid back: the
 * boot it ran in, and when it started (clock ticks since that boot, as
 * `/proc/<pid>/stat` counts them).
 */
export const processIdentitySchema = z.object({
  pid: z.number().int().positive(),
  bootId: z.string().min(1),
  startedTicks: z.number().int().nonnegative(),
});

export type ProcessIdentity = z.infer<typeof processIdentitySchema>;

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
  state: boothJobStateSchema,
  step: boothUpdateStepSchema,
  startedAt: z.string(),
  updatedAt: z.string(),
  error: z.string().nullable(),
  /** The database as it was before the switch. */
  backup: z.string().nullable(),
  /** Migrations applied before the switch, to tell whether `to` added any. */
  migrationsBefore: z.number().int().nonnegative().nullable(),
  /** Whether `to` applied migrations: then `from` can't run on it as is. */
  migrated: z.boolean().nullable(),
  /**
   * The process running the job. A `running` job whose process is gone
   * was interrupted (a crash, a timeout, a power cut): not running.
   */
  process: processIdentitySchema.nullable(),
});

export type BoothUpdateJob = z.infer<typeof boothUpdateJobSchema>;

export const boothUpdateHistorySchema = z.array(boothUpdateJobSchema);

/**
 * Where `booth rollback` would go now: the release before the last
 * update, while its folder is still on the booth. Null when there is
 * none. The CLI writes it; the admin offers what it says.
 */
export const boothRollbackTargetSchema = z
  .object({
    release: z.string(),
    /** The newer release changed the database: going back restores `backup`. */
    migrated: z.boolean(),
    backup: z.string().nullable(),
    backupTakenAt: z.string().nullable(),
  })
  .nullable();

export type BoothRollbackTarget = z.infer<typeof boothRollbackTargetSchema>;

/** The latest release on GitHub that isn't a pre-release. */
export type LatestRelease = {
  version: string;
  /** Its release notes, as markdown. */
  notes: string;
  url: string;
  publishedAt: string | null;
};

/**
 * Asks GitHub for the latest release, as `install.sh` picks it. Throws
 * when GitHub doesn't answer or the tag isn't a release version.
 */
export async function fetchLatestRelease({
  fetch: fetchImpl = fetch,
  repo = BOOTH_RELEASES_REPO,
  signal,
}: {
  fetch?: typeof fetch;
  /** `owner/name`; the CLI lets `BOOTH_RELEASES_REPO` change it. */
  repo?: string;
  signal?: AbortSignal;
} = {}): Promise<LatestRelease> {
  const response = await fetchImpl(
    `https://api.github.com/repos/${repo}/releases/latest`,
    { headers: { accept: "application/vnd.github+json" }, signal },
  );

  if (!response.ok) {
    throw new Error(
      `GitHub answered ${response.status} for the latest release.`,
    );
  }

  const body = (await response.json()) as Record<string, unknown>;
  const text = (key: string) =>
    typeof body[key] === "string" ? (body[key] as string) : null;
  const version = (text("tag_name") ?? "").replace(/^v/u, "");

  if (!isReleaseVersion(version)) {
    throw new Error(
      `The latest release's tag isn't a version: ${text("tag_name")}`,
    );
  }

  return {
    version,
    notes: text("body") ?? "",
    url: text("html_url") ?? "",
    publishedAt: text("published_at"),
  };
}

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

/**
 * Whether an event runs at `now`, given its start and end: a side left
 * empty is open. The engine's quiet check and admin's warnings agree.
 */
export const isEventRunning = (
  event: {
    startsAt: string | Date | null;
    endsAt: string | Date | null;
  } | null,
  now: number,
): boolean => {
  if (!event) return false;
  const at = (value: string | Date | null) =>
    value === null
      ? null
      : value instanceof Date
        ? value.getTime()
        : Date.parse(value);
  const starts = at(event.startsAt);
  const ends = at(event.endsAt);
  return (starts === null || starts <= now) && (ends === null || now < ends);
};
