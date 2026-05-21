import { describe, expect, test } from "bun:test";
import type USB from "@node-escpos/usb-adapter";

import { PRINTER_INITIALIZE_COMMAND } from "./printer.constants";
import type { ReceiptPrinter } from "./printer.types";
import { printRasterReceipt } from "./printer.utils";

type OpenCallback = (error?: Error | null) => void;

type Deferred<T> = {
  promise: Promise<T>;
  reject: (error: unknown) => void;
  resolve: (value: T) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function createDevice({
  attached = true,
  events,
  label,
  openError,
  openNeverCompletes,
}: {
  attached?: boolean;
  events: string[];
  label: string;
  openError?: Error;
  openNeverCompletes?: boolean;
}): USB {
  return {
    device: attached ? {} : null,
    close() {
      events.push(`device-close:${label}`);
    },
    open(callback: OpenCallback) {
      events.push(`open:${label}`);
      if (openNeverCompletes) {
        return;
      }

      callback(openError ?? null);
    },
  } as unknown as USB;
}

function createPrinter({
  closeDelay,
  events,
  label,
  throwOnFeed,
}: {
  closeDelay?: Promise<void>;
  events: string[];
  label: string;
  throwOnFeed?: Error;
}): ReceiptPrinter {
  const printer = {
    align(alignment: "ct") {
      events.push(`align:${label}:${alignment}`);
      return printer;
    },
    async close() {
      events.push(`printer-close-start:${label}`);
      await closeDelay;
      events.push(`printer-close-end:${label}`);
      return printer;
    },
    cut() {
      events.push(`cut:${label}`);
      return printer;
    },
    feed(lines: number) {
      events.push(`feed:${label}:${lines}`);

      if (throwOnFeed) {
        throw throwOnFeed;
      }

      return printer;
    },
    raw(command: Buffer) {
      events.push(`raw:${label}:${command.toString("hex")}`);
      return printer;
    },
  };

  return printer as ReceiptPrinter;
}

describe("printRasterReceipt", () => {
  test("serializes print jobs through a shared queue", async () => {
    const events: string[] = [];
    const firstClose = createDeferred<void>();
    const firstDevice = createDevice({ events, label: "first" });
    const secondDevice = createDevice({ events, label: "second" });

    const firstPrint = printRasterReceipt(firstDevice, Buffer.from([0x01]), {
      createPrinter: (_device) =>
        createPrinter({
          closeDelay: firstClose.promise,
          events,
          label: "first",
        }),
    });

    await flushMicrotasks();

    const secondPrint = printRasterReceipt(secondDevice, Buffer.from([0x02]), {
      createPrinter: (_device) => createPrinter({ events, label: "second" }),
    });

    await flushMicrotasks();

    expect(events).toContain("open:first");
    expect(events).not.toContain("open:second");

    firstClose.resolve(undefined);

    await Promise.all([firstPrint, secondPrint]);

    expect(events.indexOf("printer-close-end:first")).toBeLessThan(
      events.indexOf("open:second"),
    );
  });

  test("sends printer initialization before receipt commands", async () => {
    const events: string[] = [];
    const rasterCommand = Buffer.from([0xaa, 0xbb]);
    const device = createDevice({ events, label: "receipt" });

    await printRasterReceipt(device, rasterCommand, {
      createPrinter: (_device) => createPrinter({ events, label: "receipt" }),
    });

    expect(events).toEqual([
      "open:receipt",
      `raw:receipt:${PRINTER_INITIALIZE_COMMAND.toString("hex")}`,
      "align:receipt:ct",
      `raw:receipt:${rasterCommand.toString("hex")}`,
      "feed:receipt:2",
      "cut:receipt",
      "printer-close-start:receipt",
      "printer-close-end:receipt",
    ]);
  });

  test("rejects open and constructor failures without hanging", async () => {
    const openEvents: string[] = [];
    let openFailureCreateCalled = false;

    await expect(
      printRasterReceipt(
        createDevice({
          events: openEvents,
          label: "open-failure",
          openError: new Error("open failed"),
        }),
        Buffer.from([0x01]),
        {
          createPrinter: (_device) => {
            openFailureCreateCalled = true;
            return createPrinter({ events: openEvents, label: "unused" });
          },
        },
      ),
    ).rejects.toThrow("open failed");

    expect(openFailureCreateCalled).toBe(false);
    expect(openEvents).toEqual([
      "open:open-failure",
      "device-close:open-failure",
    ]);

    const constructorEvents: string[] = [];

    await expect(
      printRasterReceipt(
        createDevice({ events: constructorEvents, label: "constructor" }),
        Buffer.from([0x02]),
        {
          createPrinter: (_device) => {
            throw new Error("constructor failed");
          },
        },
      ),
    ).rejects.toThrow("constructor failed");

    expect(constructorEvents).toEqual([
      "open:constructor",
      "device-close:constructor",
    ]);
  });

  test("rejects detached devices before opening or creating printers", async () => {
    const events: string[] = [];
    let createCalled = false;

    await expect(
      printRasterReceipt(
        createDevice({ attached: false, events, label: "detached" }),
        Buffer.from([0x03]),
        {
          createPrinter: (_device) => {
            createCalled = true;
            return createPrinter({ events, label: "unused" });
          },
        },
      ),
    ).rejects.toThrow("Printer device is detached.");

    expect(createCalled).toBe(false);
    expect(events).toEqual(["device-close:detached"]);
  });

  test("times out a stalled open and releases the shared queue", async () => {
    const events: string[] = [];
    let stalledCreateCalled = false;
    const stalledDevice = createDevice({
      events,
      label: "stalled",
      openNeverCompletes: true,
    });
    const nextDevice = createDevice({ events, label: "next" });

    const stalledPrint = printRasterReceipt(
      stalledDevice,
      Buffer.from([0x04]),
      {
        createPrinter: (_device) => {
          stalledCreateCalled = true;
          return createPrinter({ events, label: "unused" });
        },
        openTimeoutMs: 1,
      },
    );
    const stalledExpectation = expect(stalledPrint).rejects.toThrow(
      "Printer open timed out.",
    );

    await flushMicrotasks();

    const nextPrint = printRasterReceipt(nextDevice, Buffer.from([0x05]), {
      createPrinter: (_device) => createPrinter({ events, label: "next" }),
    });

    expect(events).toContain("open:stalled");
    expect(events).not.toContain("open:next");

    await stalledExpectation;
    await nextPrint;

    expect(stalledCreateCalled).toBe(false);
    expect(events).toContain("open:next");
    expect(events.indexOf("device-close:stalled")).toBeLessThan(
      events.indexOf("open:next"),
    );
  });

  test("closes printer after command processing errors", async () => {
    const events: string[] = [];
    const feedError = new Error("feed failed");

    await expect(
      printRasterReceipt(
        createDevice({ events, label: "command-failure" }),
        Buffer.from([0x03]),
        {
          createPrinter: (_device) =>
            createPrinter({
              events,
              label: "command-failure",
              throwOnFeed: feedError,
            }),
        },
      ),
    ).rejects.toThrow("feed failed");

    expect(events).toContain("printer-close-start:command-failure");
    expect(events).toContain("printer-close-end:command-failure");
  });
});
