import { describe, expect, it } from "bun:test";

import { buildUpdateSnapshot } from "./update.state";
import { createJobFixture } from "./update.testing";

const CHECK = { state: "ok" as const, checkedAt: null, message: null };
const latest = (version: string) => ({
  version,
  notes: "",
  url: "",
  publishedAt: null,
});
const booth = {
  isRelease: true,
  check: CHECK,
  job: null,
  jobRunning: false,
  log: [],
  previous: null,
  freeBytes: 5 * 1024 ** 3,
};

describe("buildUpdateSnapshot", () => {
  it("offers a newer release, not the same or an older one", () => {
    expect(
      buildUpdateSnapshot({
        ...booth,
        release: "0.7.2",
        latest: latest("0.8.0"),
      }).updateAvailable,
    ).toBe(true);
    expect(
      buildUpdateSnapshot({
        ...booth,
        release: "0.8.0",
        latest: latest("0.8.0"),
      }).updateAvailable,
    ).toBe(false);
    expect(
      buildUpdateSnapshot({
        ...booth,
        release: "0.9.0-rc.1",
        latest: latest("0.8.0"),
      }).updateAvailable,
    ).toBe(false);
  });

  it("offers any release to a checkout, which has nothing to go back to", () => {
    const snapshot = buildUpdateSnapshot({
      ...booth,
      release: "0.7.2-2-g806eca4",
      isRelease: false,
      latest: latest("0.7.2"),
      previous: {
        release: "x",
        migrated: false,
        backup: null,
        backupTakenAt: null,
      },
    });

    expect(snapshot.updateAvailable).toBe(true);
    expect(snapshot.previous).toBeNull();
  });

  it("passes on where the CLI says a rollback goes, and whether a job really runs", () => {
    const previous = {
      release: "0.7.2",
      migrated: true,
      backup: "/mnt/ssd/dither-booth/backups/update-x.sqlite",
      backupTakenAt: "2026-10-29T10:00:00.000Z",
    };
    const snapshot = buildUpdateSnapshot({
      ...booth,
      release: "0.8.0",
      latest: null,
      job: createJobFixture({ state: "running" }),
      jobRunning: false,
      previous,
    });

    expect(snapshot.previous).toEqual(previous);
    expect(snapshot.jobRunning).toBe(false);
    expect(snapshot.preflight).toEqual({
      freeBytes: 5 * 1024 ** 3,
      neededBytes: 1024 ** 3,
    });
  });
});
