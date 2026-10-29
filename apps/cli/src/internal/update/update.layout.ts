import { lstat, readlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  ENGINE_DATA_RELATIVE,
  SSD_BOOTH_DIR,
  SSD_DATA_DIR,
} from "#internal/config";

/*
 * Where releases live on the booth. `repoLink` stays the path everything
 * already names (the unit's WorkingDirectory, logrotate, the dispatcher),
 * as a symlink to one release folder. What the apps write at runtime lives
 * outside the releases and is linked into each.
 */
export type UpdateLayout = {
  /** `/opt/dither-booth`: a symlink to the running release. */
  repoLink: string;
  /** One folder per release, named by its version. */
  releasesDir: string;
  /** What outlives a release: `.local` (certificates, tokens) and `logs`. */
  sharedDir: string;
  /** Downloads, kept until the next update. */
  cacheDir: string;
  /** status.json and history.json. */
  stateDir: string;
  /** Where each release's `apps/engine/data` points. */
  dataDir: string;
  backupsDir: string;
};

/** Linked from `sharedDir` into every release, by the same relative path. */
export const SHARED_PATHS = [".local", "logs"] as const;

export const LEGACY_RELEASE_PREFIX = "legacy-";

export function createUpdateLayout({
  repoRoot,
  stateDir,
}: {
  repoRoot: string;
  stateDir: string;
}): UpdateLayout {
  return {
    repoLink: repoRoot,
    releasesDir: `${repoRoot}-releases`,
    sharedDir: `${repoRoot}-shared`,
    cacheDir: "/var/cache/ditherbooth",
    stateDir,
    dataDir: SSD_DATA_DIR,
    backupsDir: join(SSD_BOOTH_DIR, "backups"),
  };
}

export const engineDataPath = (releaseDir: string) =>
  join(releaseDir, ENGINE_DATA_RELATIVE);

export type RepoState =
  /** `repoLink` points at a release folder. */
  | { kind: "release"; dir: string }
  /** A git checkout built in place, from before releases. */
  | { kind: "checkout"; dir: string }
  | { kind: "missing" };

export async function readRepoState(layout: UpdateLayout): Promise<RepoState> {
  const stats = await lstat(layout.repoLink).catch(() => undefined);

  if (!stats) return { kind: "missing" };

  if (stats.isSymbolicLink()) {
    const target = await readlink(layout.repoLink);
    return {
      kind: "release",
      dir: resolve(dirname(layout.repoLink), target),
    };
  }

  return { kind: "checkout", dir: layout.repoLink };
}

export const releaseDirFor = (layout: UpdateLayout, version: string) =>
  join(layout.releasesDir, version);

/** Finds a recorded release among the folders: by version, or as legacy. */
export const releaseDirCandidates = (layout: UpdateLayout, release: string) => [
  join(layout.releasesDir, release),
  join(layout.releasesDir, `${LEGACY_RELEASE_PREFIX}${release}`),
];

/**
 * Which release folders to delete: all but the running one and the one
 * before it, so a rollback always has somewhere to go.
 */
export function planPrune(
  folders: readonly string[],
  keep: readonly (string | null | undefined)[],
): string[] {
  const kept = new Set(keep.filter((name): name is string => Boolean(name)));
  return folders.filter((name) => !kept.has(name) && !name.endsWith(".tmp"));
}
