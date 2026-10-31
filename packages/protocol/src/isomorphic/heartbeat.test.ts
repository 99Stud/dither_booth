import type { MaintenanceReason } from "@dither-booth/shared/kiosk";
import type { PrinterCondition as BoothPrinterCondition } from "@dither-booth/shared/printer";
import type { z } from "zod";

import { BOOTH_JOB_STATES as SHARED_JOB_STATES } from "@dither-booth/shared/booth-update";
import { describe, expect, test } from "bun:test";

import {
  BOOTH_JOB_STATES,
  heartbeatReplySchema,
  heartbeatSchema,
  type maintenanceReasonSchema,
  type printerConditionSchema,
} from "#isomorphic/heartbeat";
import { HEARTBEAT_FIXTURES } from "#isomorphic/heartbeat.fixtures";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

// A compile error here means the booth and the Hub disagree on a name.
// `bun test` can't see it, so the package's test script runs tsc first.
const printerConditionsMatch: Equal<
  z.infer<typeof printerConditionSchema>,
  BoothPrinterCondition
> = true;
const maintenanceReasonsMatch: Equal<
  z.infer<typeof maintenanceReasonSchema>,
  MaintenanceReason
> = true;

describe("heartbeatSchema", () => {
  test("the names the booth uses are the names the Hub reads", () => {
    // Checked when the file compiles (see above); this keeps both in use.
    expect([printerConditionsMatch, maintenanceReasonsMatch]).toEqual([
      true,
      true,
    ]);
  });

  test.each(Object.entries(HEARTBEAT_FIXTURES))(
    "accepts the %s fixture",
    (_, fixture) => {
      expect(heartbeatSchema.parse(fixture)).toEqual(fixture);
    },
  );

  test("the job states a booth writes are the ones the Hub reads", () => {
    expect([...BOOTH_JOB_STATES]).toEqual([...SHARED_JOB_STATES]);
  });

  test("reads a booth from before updates, which sends no update", () => {
    const { ready } = HEARTBEAT_FIXTURES;
    expect(heartbeatSchema.parse(ready).update).toBeUndefined();
  });

  test("reads a booth from before the lottery's state, which sends none", () => {
    const { ready } = HEARTBEAT_FIXTURES;
    expect(heartbeatSchema.parse(ready).lottery).toBeUndefined();
  });

  test("reads a booth from before the camera's state, which sends none", () => {
    const { ready } = HEARTBEAT_FIXTURES;
    expect(heartbeatSchema.parse(ready).camera).toBeUndefined();
  });

  test("ignores a field a newer booth adds", () => {
    const { ready } = HEARTBEAT_FIXTURES;
    const parsed = heartbeatSchema.parse({ ...ready, spoolBacklog: 3 });
    expect(parsed).toEqual(ready);
  });

  test.each([
    [
      "an unknown printer condition",
      {
        printer: {
          ...HEARTBEAT_FIXTURES.ready.printer,
          conditions: ["on-fire"],
        },
      },
    ],
    ["a time that isn't ISO 8601", { sentAt: "yesterday" }],
    ["a missing dry-run flag", { dryRun: undefined }],
    ["an empty release", { release: " " }],
    ["a negative protocol", { protocol: -1 }],
    ["a negative stock", { lottery: { live: true, stockLeft: -1 } }],
    [
      "a camera state with no time",
      { camera: { on: false, changedAt: undefined } },
    ],
    [
      "an unknown maintenance reason",
      { maintenance: { on: true, reasons: ["tired"] } },
    ],
  ])("refuses %s", (_, change) => {
    const { ready } = HEARTBEAT_FIXTURES;
    expect(heartbeatSchema.safeParse({ ...ready, ...change }).success).toBe(
      false,
    );
  });
});

describe("the Hub's answer", () => {
  const halloween = {
    id: "e1000000-0000-4000-8000-0000000000e1",
    name: "Halloween",
    startsAt: "2026-10-31T18:00:00+00:00",
    endsAt: "2026-11-01T02:00:00+00:00",
  };

  test("carries the event the booth is at", () => {
    const reply = heartbeatReplySchema.parse({
      ok: true,
      update: null,
      event: halloween,
    });
    expect(reply.event).toEqual(halloween);
  });

  test("reads a Hub from before events, which sends none", () => {
    expect(heartbeatReplySchema.parse({ ok: true }).event).toBeUndefined();
  });

  test("reads an event it can't use as none, and keeps the update", () => {
    const reply = heartbeatReplySchema.parse({
      ok: true,
      update: { release: "0.9.0" },
      event: { ...halloween, startsAt: "Saturday" },
    });
    expect(reply.event).toBeNull();
    expect(reply.update).toEqual({ release: "0.9.0" });
  });
});
