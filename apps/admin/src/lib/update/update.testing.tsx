import type { BoothUpdateJob } from "@dither-booth/shared/booth-update";

import type { UpdateSnapshot } from "./update.protocol";

/** A finished update job, for tests. */
export const createJobFixture = (
  overrides: Partial<BoothUpdateJob> = {},
): BoothUpdateJob => ({
  kind: "update",
  jobId: "2026-10-29T10-00-00-000Z",
  from: "0.7.2",
  to: "0.8.0",
  state: "done",
  step: "check",
  startedAt: "2026-10-29T10:00:00.000Z",
  updatedAt: "2026-10-29T10:04:00.000Z",
  error: null,
  backup: "/mnt/ssd/dither-booth/backups/update-x.sqlite",
  migrationsBefore: 3,
  migrated: false,
  process: null,
  ...overrides,
});

export const createSnapshotFixture = (
  overrides: Partial<UpdateSnapshot> = {},
): UpdateSnapshot => ({
  release: "0.8.0",
  isRelease: true,
  latest: {
    version: "0.8.0",
    notes: "",
    url: "https://github.com/99Stud/dither_booth/releases/tag/v0.8.0",
    publishedAt: "2026-10-28T10:00:00.000Z",
  },
  updateAvailable: false,
  check: { state: "ok", checkedAt: new Date().toISOString(), message: null },
  job: null,
  jobRunning: false,
  log: [],
  history: [],
  previous: null,
  preflight: { freeBytes: 5 * 1024 ** 3, neededBytes: 1024 ** 3 },
  ...overrides,
});
