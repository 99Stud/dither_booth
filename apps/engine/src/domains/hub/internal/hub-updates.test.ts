import type { BoothUpdateJob } from "@dither-booth/shared/booth-update";
import type { SystemctlOutcome } from "@dither-booth/shared/server/systemctl";

import { describe, expect, test } from "bun:test";

import { campaignTable, visitTable } from "#db/internal/db.schema";
import { createTestDb } from "#db/internal/db.test-utils";

import {
  createRemoteUpdates,
  type Quietness,
  readQuietness,
} from "./hub-updates";

const NOW = new Date("2026-10-31T18:00:00.000Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

const job = (overrides: Partial<BoothUpdateJob> = {}): BoothUpdateJob => ({
  kind: "update",
  jobId: "job",
  from: "0.7.0",
  to: "0.8.0",
  state: "running",
  step: "download",
  startedAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  error: null,
  backup: null,
  migrated: null,
  ...overrides,
});

function setup({
  quietness = { quiet: true },
  current = null,
  start = { ok: true },
}: {
  quietness?: Quietness;
  current?: BoothUpdateJob | null;
  start?: SystemctlOutcome;
} = {}) {
  const started: string[] = [];
  let jobFile = current;
  const updates = createRemoteUpdates({
    release: "0.7.0",
    readJob: async () => jobFile,
    readQuietness: () => quietness,
    startUnit: async (unit) => {
      started.push(unit);
      return start;
    },
    log: () => {},
    now: () => NOW,
  });
  return {
    updates,
    started,
    setJob: (next: BoothUpdateJob | null) => {
      jobFile = next;
    },
  };
}

describe("remote updates", () => {
  test("start the asked release's unit once the booth is quiet", async () => {
    const { updates, started, setJob } = setup();

    await updates.request("0.8.0");
    setJob(job());

    expect(started).toEqual(["ditherbooth-update@0.8.0.service"]);
    expect(await updates.report()).toEqual({
      release: "0.8.0",
      state: "running",
      error: null,
    });
  });

  test("wait, and say why, while the event runs", async () => {
    const { updates, started } = setup({
      quietness: { quiet: false, reason: "The event runs until 23:00." },
    });

    await updates.request("0.8.0");

    expect(started).toEqual([]);
    expect(await updates.report()).toEqual({
      release: "0.8.0",
      state: "waiting",
      error: "The event runs until 23:00.",
    });
  });

  test("never start a second job, the release it runs, or a non-version", async () => {
    const running = setup({ current: job({ to: "0.7.5" }) });
    await running.updates.request("0.8.0");
    expect(running.started).toEqual([]);

    const same = setup();
    await same.updates.request("0.7.0");
    await same.updates.request("latest; reboot");
    expect(same.started).toEqual([]);
  });

  test("report a unit that couldn't start as failed", async () => {
    const { updates } = setup({
      start: {
        ok: false,
        code: "not-permitted",
        message:
          "The booth doesn't allow this yet. Run `sudo booth service` on the booth.",
        exitCode: 1,
        stderr: "Access denied",
      },
    });

    await updates.request("0.8.0");

    expect(await updates.report()).toMatchObject({ state: "failed" });
  });

  test("after its own restart, report how the last job ended, for a day", async () => {
    const recent = setup({
      current: job({ state: "rolled-back", error: "x" }),
    });
    expect(await recent.updates.report()).toEqual({
      release: "0.8.0",
      state: "rolled-back",
      error: "x",
    });

    const old = setup({
      current: job({
        state: "done",
        updatedAt: minutes(-25 * 60).toISOString(),
      }),
    });
    expect(await old.updates.report()).toBeUndefined();
  });
});

describe("readQuietness", () => {
  const seed = ({
    startsAt,
    endsAt,
    visitAt,
  }: {
    startsAt?: Date;
    endsAt?: Date;
    visitAt?: Date;
  }) => {
    const { db } = createTestDb();
    db.insert(campaignTable)
      .values({
        name: "Launch",
        status: "active",
        startsAt,
        endsAt,
      } as typeof campaignTable.$inferInsert)
      .run();
    if (visitAt) {
      db.insert(visitTable)
        .values({ startedAt: visitAt, updatedAt: visitAt })
        .run();
    }
    return db;
  };

  test("is quiet outside the event window, with no recent visit", () => {
    expect(
      readQuietness(
        seed({ startsAt: minutes(-300), endsAt: minutes(-60) }),
        NOW,
      ),
    ).toEqual({ quiet: true });
    expect(
      readQuietness(seed({ startsAt: minutes(60), endsAt: minutes(300) }), NOW),
    ).toEqual({ quiet: true });
  });

  test("isn't during the event, nor in an event with no end", () => {
    expect(
      readQuietness(seed({ startsAt: minutes(-60), endsAt: minutes(60) }), NOW)
        .quiet,
    ).toBe(false);
    expect(readQuietness(seed({ startsAt: minutes(-60) }), NOW)).toMatchObject({
      quiet: false,
      reason: expect.stringContaining("no end time"),
    });
  });

  test("isn't within 15 minutes of a visit", () => {
    expect(readQuietness(seed({ visitAt: minutes(-10) }), NOW).quiet).toBe(
      false,
    );
    expect(readQuietness(seed({ visitAt: minutes(-20) }), NOW).quiet).toBe(
      true,
    );
  });
});
