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

describe("buildUpdateSnapshot", () => {
  it("offers a newer release, not the same or an older one", () => {
    const base = { isRelease: true, check: CHECK, job: null, history: [] };

    expect(
      buildUpdateSnapshot({
        ...base,
        release: "0.7.2",
        latest: latest("0.8.0"),
      }).updateAvailable,
    ).toBe(true);
    expect(
      buildUpdateSnapshot({
        ...base,
        release: "0.8.0",
        latest: latest("0.8.0"),
      }).updateAvailable,
    ).toBe(false);
    expect(
      buildUpdateSnapshot({
        ...base,
        release: "0.9.0-rc.1",
        latest: latest("0.8.0"),
      }).updateAvailable,
    ).toBe(false);
  });

  it("offers any release to a checkout, which has no rollback", () => {
    const snapshot = buildUpdateSnapshot({
      release: "0.7.2-2-g806eca4",
      isRelease: false,
      latest: latest("0.7.2"),
      check: CHECK,
      job: null,
      history: [createJobFixture({ to: "0.7.2-2-g806eca4" })],
    });

    expect(snapshot.updateAvailable).toBe(true);
    expect(snapshot.previous).toBeNull();
  });

  it("goes back to where the update to this release came from, saying if it migrated", () => {
    const snapshot = buildUpdateSnapshot({
      release: "0.8.0",
      isRelease: true,
      latest: null,
      check: CHECK,
      job: null,
      history: [
        createJobFixture({ state: "failed", to: "0.9.0", from: "0.8.0" }),
        createJobFixture({ migrated: true }),
      ],
    });

    expect(snapshot.previous).toEqual({
      release: "0.7.2",
      migrated: true,
      backupTakenAt: "2026-10-29T10:00:00.000Z",
    });
  });
});
