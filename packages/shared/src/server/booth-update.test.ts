import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  isJobRunning,
  isReleaseBundle,
  readBoothUpdateJob,
} from "./booth-update";
import { currentProcessIdentity } from "./process-identity";

const job = {
  kind: "update" as const,
  jobId: "j",
  from: "0.7.2",
  to: "0.8.0",
  state: "running" as const,
  step: "download" as const,
  startedAt: "2026-10-29T10:00:00.000Z",
  updatedAt: "2026-10-29T10:00:00.000Z",
  error: null,
  backup: null,
  migrationsBefore: null,
  migrated: null,
  process: null,
};

describe("booth update files", () => {
  test("a running job is running only while its process is", () => {
    const me = currentProcessIdentity();

    // Unknown process (off Linux): taken as running, as the file says.
    expect(isJobRunning(job)).toBe(true);
    if (me) {
      expect(isJobRunning({ ...job, process: me })).toBe(true);
      expect(
        isJobRunning({ ...job, process: { ...me, pid: 2_147_483_000 } }),
      ).toBe(false);
    }
    expect(isJobRunning({ ...job, state: "done" })).toBe(false);
    expect(isJobRunning(null)).toBe(false);
  });

  test("reads the status file, and nothing off the booth", async () => {
    const dir = mkdtempSync(join(tmpdir(), "booth-update-"));
    try {
      writeFileSync(join(dir, "status.json"), JSON.stringify(job));
      expect(await readBoothUpdateJob(join(dir, "status.json"))).toEqual(job);
      expect(await readBoothUpdateJob(join(dir, "missing.json"))).toBeNull();
      expect(isReleaseBundle(dir)).toBe(false);
      writeFileSync(join(dir, "release.json"), "{}");
      expect(isReleaseBundle(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
