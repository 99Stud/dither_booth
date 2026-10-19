import { afterEach, describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";

import type { PrinterCondition, PrinterStatus } from "./printer.types";

import { createPrinterMaintenancePolicy } from "./printer-maintenance-policy";
import { waitFor } from "./printer.test-utils";

const DELAYS = { disconnectMs: 60, enterMs: 30, leaveMs: 30 };
const stops: Array<() => void> = [];

afterEach(() => {
  while (stops.length > 0) stops.pop()?.();
});

const BLOCKING: PrinterCondition[] = [
  "paper-out",
  "cover-open",
  "error",
  "disconnected",
  "unknown",
];

/** A printer whose status the test sets directly. */
function setup(initial: PrinterCondition[] = ["unknown"]) {
  const emitter = new EventEmitter();
  let status = statusOf(initial);
  const faults: boolean[] = [];
  let fault = false;
  const policy = createPrinterMaintenancePolicy({
    delays: DELAYS,
    log: () => {},
    maintenance: {
      setPrinterFault: (active) => {
        fault = active;
        faults.push(active);
      },
    },
    printer: {
      getStatus: () => status,
      subscribe: (listener) => {
        emitter.on("status", listener);
        return () => emitter.off("status", listener);
      },
    },
  });
  policy.start();
  stops.push(policy.stop);

  return {
    faults,
    get fault() {
      return fault;
    },
    set(conditions: PrinterCondition[]) {
      status = statusOf(conditions);
      emitter.emit("status", status);
    },
  };
}

function statusOf(conditions: PrinterCondition[]): PrinterStatus {
  return {
    canPrint: conditions.every((condition) => !BLOCKING.includes(condition)),
    changedAt: "",
    checkedAt: "",
    conditions,
    history: [],
    lastError: null,
    offline: false,
    raw: null,
  };
}

describe("printer maintenance", () => {
  test("a fault that lasts puts the booth in maintenance, the fix ends it", async () => {
    const printer = setup([]);

    printer.set(["cover-open"]);
    await Bun.sleep(DELAYS.enterMs / 2);
    expect(printer.fault).toBe(false);
    await waitFor(() => printer.fault);

    printer.set([]);
    await Bun.sleep(DELAYS.leaveMs / 2);
    expect(printer.fault).toBe(true);
    await waitFor(() => !printer.fault);
  });

  test("a cover opened and shut straight away changes nothing", async () => {
    const printer = setup([]);

    printer.set(["cover-open"]);
    await Bun.sleep(DELAYS.enterMs / 3);
    printer.set([]);
    await Bun.sleep(DELAYS.enterMs * 2);

    expect(printer.faults).toEqual([]);
  });

  test("paper low never puts the booth in maintenance", async () => {
    const printer = setup([]);

    printer.set(["paper-near-end"]);
    await Bun.sleep(DELAYS.enterMs * 2);

    expect(printer.faults).toEqual([]);
  });

  test("an unplugged printer gets longer before maintenance", async () => {
    const printer = setup([]);

    printer.set(["disconnected"]);
    await Bun.sleep(DELAYS.enterMs * 1.5);
    expect(printer.fault).toBe(false);
    await waitFor(() => printer.fault);
  });

  test("unplugged, then plugged back with no paper, counts from the first fault", async () => {
    const printer = setup([]);

    printer.set(["disconnected"]);
    await Bun.sleep(DELAYS.enterMs * 1.2);
    printer.set(["paper-out"]);

    // Already past the 3 s rule, so the fault applies at once.
    await waitFor(() => printer.fault, DELAYS.enterMs / 2);
  });

  test("a fault back before maintenance ended keeps the booth closed", async () => {
    const printer = setup([]);
    printer.set(["paper-out"]);
    await waitFor(() => printer.fault);

    printer.set([]);
    await Bun.sleep(DELAYS.leaveMs / 3);
    printer.set(["cover-open"]);
    await Bun.sleep(DELAYS.leaveMs * 2);

    expect(printer.faults).toEqual([true]);
  });

  test("the first status the printer reports applies at once", () => {
    const printer = setup(["unknown"]);

    printer.set(["cover-open"]);

    expect(printer.fault).toBe(true);
  });

  test("connecting at start doesn't close the booth before the printer answers", async () => {
    const printer = setup(["unknown"]);

    await Bun.sleep(DELAYS.enterMs * 1.5);
    printer.set([]);
    await Bun.sleep(DELAYS.disconnectMs);

    expect(printer.faults).toEqual([]);
  });
});
