import {
  BOOTH_UPDATE_MIN_FREE_BYTES,
  type BoothRollbackTarget,
  type BoothUpdateJob,
  type LatestRelease,
  compareReleaseVersions,
  isReleaseVersion,
} from "@dither-booth/shared/booth-update";

import type { ReleaseCheck, UpdateSnapshot } from "./update.protocol";

/** The Software panel's snapshot, from what the booth and GitHub say. */
export function buildUpdateSnapshot({
  release,
  isRelease,
  latest,
  check,
  job,
  jobRunning,
  log,
  history,
  previous,
  freeBytes,
}: {
  release: string;
  isRelease: boolean;
  latest: LatestRelease | null;
  check: ReleaseCheck;
  job: BoothUpdateJob | null;
  jobRunning: boolean;
  log: string[];
  history: BoothUpdateJob[];
  previous: BoothRollbackTarget;
  freeBytes: number | null;
}): UpdateSnapshot {
  // A checkout's `git describe` (0.7.2-3-gabc) reads as older than any release.
  const updateAvailable =
    latest !== null &&
    isReleaseVersion(latest.version) &&
    (!isRelease || compareReleaseVersions(latest.version, release) > 0);

  return {
    release,
    isRelease,
    latest,
    updateAvailable,
    check,
    job,
    jobRunning,
    log,
    history,
    // The CLI writes it after every job; a checkout has none yet.
    previous: isRelease ? previous : null,
    preflight: { freeBytes, neededBytes: BOOTH_UPDATE_MIN_FREE_BYTES },
  };
}
