import type { MaintenanceReason } from "@dither-booth/shared/kiosk";
import type { PrinterCondition as BoothPrinterCondition } from "@dither-booth/shared/printer";
import type { z } from "zod";

import { describe, expect, test } from "bun:test";

import {
  heartbeatSchema,
  PROTOCOL_VERSION,
  type maintenanceReasonSchema,
  type printerConditionSchema,
  type Heartbeat,
} from "#isomorphic/heartbeat";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

// A compile error here means the booth and the Hub disagree on a name.
const printerConditionsMatch: Equal<
  z.infer<typeof printerConditionSchema>,
  BoothPrinterCondition
> = true;
const maintenanceReasonsMatch: Equal<
  z.infer<typeof maintenanceReasonSchema>,
  MaintenanceReason
> = true;

const ready: Heartbeat = {
  protocol: PROTOCOL_VERSION,
  version: "0.7.0",
  dryRun: false,
  sentAt: "2026-10-31T18:00:30.000Z",
  printer: {
    conditions: [],
    canPrint: true,
    changedAt: "2026-10-31T17:00:00.000Z",
  },
  maintenance: { on: false, reasons: [] },
};

const paperOut: Heartbeat = {
  ...ready,
  printer: {
    conditions: ["paper-out"],
    canPrint: false,
    changedAt: "2026-10-31T18:00:00.000Z",
  },
  maintenance: { on: true, reasons: ["printer"] },
};

describe("heartbeatSchema", () => {
  test("the names the booth uses are the names the Hub reads", () => {
    expect(printerConditionsMatch).toBe(true);
    expect(maintenanceReasonsMatch).toBe(true);
  });

  test.each([
    ["a ready booth", ready],
    ["a booth out of paper, in maintenance", paperOut],
  ])("accepts %s", (_, fixture) => {
    expect(heartbeatSchema.parse(fixture)).toEqual(fixture);
  });

  test("ignores a field a newer booth adds", () => {
    const parsed = heartbeatSchema.parse({ ...ready, spoolBacklog: 3 });
    expect(parsed).toEqual(ready);
  });

  test.each([
    [
      "an unknown printer condition",
      { printer: { ...ready.printer, conditions: ["on-fire"] } },
    ],
    ["a time that isn't ISO 8601", { sentAt: "yesterday" }],
    ["a missing dry-run flag", { dryRun: undefined }],
    ["an empty release", { version: " " }],
    ["a negative protocol", { protocol: -1 }],
    [
      "an unknown maintenance reason",
      { maintenance: { on: true, reasons: ["tired"] } },
    ],
  ])("refuses %s", (_, change) => {
    expect(heartbeatSchema.safeParse({ ...ready, ...change }).success).toBe(
      false,
    );
  });
});
