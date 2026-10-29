import {
  type BoothUpdateJob,
  compareReleaseVersions,
  isReleaseVersion,
} from "@dither-booth/shared/booth-update";

import type {
  LatestRelease,
  ReleaseCheck,
  UpdateSnapshot,
} from "./update.protocol";

/** The Software panel's snapshot, from what the booth and GitHub say. */
export function buildUpdateSnapshot({
  release,
  isRelease,
  latest,
  check,
  job,
  history,
}: {
  release: string;
  isRelease: boolean;
  latest: LatestRelease | null;
  check: ReleaseCheck;
  job: BoothUpdateJob | null;
  history: BoothUpdateJob[];
}): UpdateSnapshot {
  // A checkout's `git describe` (0.7.2-3-gabc) reads as older than any release.
  const updateAvailable =
    latest !== null &&
    isReleaseVersion(latest.version) &&
    (!isRelease || compareReleaseVersions(latest.version, release) > 0);
  const installed = isRelease
    ? history.find(
        (entry) =>
          entry.kind === "update" &&
          entry.state === "done" &&
          entry.to === release &&
          entry.from !== null,
      )
    : undefined;

  return {
    release,
    isRelease,
    latest,
    updateAvailable,
    check,
    job,
    previous:
      installed?.from != null
        ? {
            release: installed.from,
            migrated: installed.migrated === true,
            backupTakenAt: installed.backup ? installed.startedAt : null,
          }
        : null,
  };
}
