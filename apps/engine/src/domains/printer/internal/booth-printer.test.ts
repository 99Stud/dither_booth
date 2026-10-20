import { afterEach, describe, expect, test } from "bun:test";

import { type BoothPrinter, createBoothPrinter } from "./booth-printer";
import { DLE_DC4_CLEAR_BUFFERS, framePrintJob } from "./printer.escpos";
import { createFakeTransport, waitFor } from "./printer.test-utils";
import { PrinterUnavailableError } from "./printer.transport";

const READY = "14 00 00 0f";
const COVER_OPEN = "3c 00 00 0f";
const FEED_HELD = "5c 00 00 0f";
const PAPER_OUT = "1c 00 0c 0f";
const RASTER = Buffer.from([
  0x1d, 0x76, 0x30, 0x00, 0x01, 0x00, 0x01, 0x00, 0xff,
]);

const DELAYS = {
  asbRetries: 2,
  asbRetryMs: 30,
  attachSettleMs: 1,
  emptyReadMs: 1,
  reconnectMaxMs: 20,
  reconnectMinMs: 5,
  stallMs: 80,
};

const started: BoothPrinter[] = [];

afterEach(async () => {
  await Promise.all(started.splice(0).map((printer) => printer.stop()));
});

function setup({ present = true } = {}) {
  const fake = createFakeTransport({ present });
  const clock = { at: Date.UTC(2026, 9, 19, 14, 2) };
  const printer = createBoothPrinter({
    delays: DELAYS,
    log: () => {},
    now: () => clock.at,
    transport: fake.transport,
  });
  started.push(printer);
  return { clock, fake, printer };
}

async function ready() {
  const context = setup();
  context.printer.start();
  context.fake.send(READY);
  await waitFor(() => context.printer.getStatus().canPrint);
  return context;
}

const hexes = (writes: Buffer[]) =>
  writes.map((write) => write.toString("hex"));

describe("status", () => {
  test("is unknown until the printer reports", () => {
    const { printer } = setup();

    expect(printer.getStatus()).toMatchObject({
      canPrint: false,
      conditions: ["unknown"],
      raw: null,
    });
  });

  test("turns Automatic Status Back on, then reads the first packet", async () => {
    const { fake, printer } = await ready();

    expect(hexes(fake.writes)[0]).toBe("1d61ff");
    expect(printer.getStatus()).toMatchObject({
      canPrint: true,
      conditions: [],
      offline: false,
      raw: "1400000f",
    });
  });

  test("a fault changes the conditions and when they changed", async () => {
    const { clock, fake, printer } = await ready();

    clock.at += 60_000;
    fake.send(COVER_OPEN);
    await waitFor(() => !printer.getStatus().canPrint);

    expect(printer.getStatus()).toMatchObject({
      changedAt: new Date(clock.at).toISOString(),
      conditions: ["cover-open"],
      offline: true,
    });
  });

  test("the same packet again only moves checkedAt", async () => {
    const { clock, fake, printer } = await ready();
    const { changedAt } = printer.getStatus();

    clock.at += 5_000;
    fake.send(READY);
    await waitFor(
      () => printer.getStatus().checkedAt === new Date(clock.at).toISOString(),
    );

    expect(printer.getStatus().changedAt).toBe(changedAt);
  });

  test("Feed held is offline but can still print, and leaves no history", async () => {
    const { fake, printer } = await ready();
    const historyLength = printer.getStatus().history.length;

    fake.send(FEED_HELD);
    await waitFor(() => printer.getStatus().offline);

    expect(printer.getStatus()).toMatchObject({
      canPrint: true,
      conditions: [],
    });
    expect(printer.getStatus().history).toHaveLength(historyLength);
  });

  test("keeps the last 20 changes, newest first", async () => {
    const { fake, printer } = await ready();

    for (let index = 0; index < 12; index++) {
      fake.send(PAPER_OUT);
      fake.send(READY);
    }
    await waitFor(() => printer.getStatus().history.length === 20);
    await Bun.sleep(20);

    const { history } = printer.getStatus();
    expect(history).toHaveLength(20);
    expect(history[0]?.conditions).toEqual([]);
    expect(history[1]?.conditions).toEqual(["paper-out"]);
  });

  test("watch yields the status first, then each change, missing none", async () => {
    const { fake, printer } = await ready();
    const controller = new AbortController();
    const stream = printer.watch(controller.signal);

    fake.send(COVER_OPEN);
    const first = await stream.next();
    const second = await stream.next();
    controller.abort();

    expect(first.value?.conditions).toEqual([]);
    expect(second.value?.conditions).toEqual(["cover-open"]);
  });

  test("subscribe hears changes until unsubscribed", async () => {
    const { fake, printer } = await ready();
    const heard: string[][] = [];
    const unsubscribe = printer.subscribe((status) =>
      heard.push([...status.conditions]),
    );

    fake.send(PAPER_OUT);
    await waitFor(() => heard.length === 1);
    unsubscribe();
    fake.send(READY);
    await waitFor(() => printer.getStatus().canPrint);

    expect(heard).toEqual([["paper-out"]]);
  });
});

describe("connection", () => {
  test("no printer at start is disconnected, and says why", async () => {
    const { fake, printer } = setup({ present: false });
    printer.start();

    await waitFor(() => fake.opens >= 2);

    expect(printer.getStatus()).toMatchObject({
      canPrint: false,
      conditions: ["disconnected"],
      lastError: "No receipt printer on USB.",
    });
  });

  test("unplugged, then plugged back in, reconnects and re-arms status", async () => {
    const { fake, printer } = await ready();

    fake.unplug();
    await waitFor(() => printer.getStatus().conditions[0] === "disconnected");
    fake.plugIn();
    await waitFor(() => fake.opens === 2);
    fake.send(READY);
    await waitFor(() => printer.getStatus().canPrint);

    expect(
      hexes(fake.writes).filter((write) => write === "1d61ff"),
    ).toHaveLength(2);
  });

  test("a printer that stays silent gets Automatic Status Back again", async () => {
    const { fake, printer } = setup();
    printer.start();

    await waitFor(
      () =>
        hexes(fake.writes).filter((write) => write === "1d61ff").length === 3,
    );
    expect(printer.getStatus().conditions).toEqual(["unknown"]);
  });

  test("stop turns status back off and stops listening for the printer", async () => {
    const { fake, printer } = await ready();

    await printer.stop();

    expect(hexes(fake.writes).at(-1)).toBe("1d6100");
    expect(fake.attachListenerCount).toBe(0);
  });

  test("without a transport (dry run), start does nothing", () => {
    const printer = createBoothPrinter({ log: () => {} });
    printer.start();

    expect(printer.getStatus().conditions).toEqual(["unknown"]);
  });
});

describe("print", () => {
  test("sends the framed job with status re-armed after ESC @", async () => {
    const { fake, printer } = await ready();

    await printer.print(RASTER);

    expect(hexes(fake.writes).at(-1)).toBe(
      framePrintJob(RASTER, { asb: true }).toString("hex"),
    );
  });

  test("refuses a job when the printer can't print", async () => {
    const { fake, printer } = await ready();
    fake.send(PAPER_OUT);
    await waitFor(() => !printer.getStatus().canPrint);

    const error = await printer.print(RASTER).catch((reason) => reason);

    expect(error).toBeInstanceOf(PrinterUnavailableError);
    expect(error.conditions).toEqual(["paper-out"]);
    expect(error.message).toBe("Printer not ready: out of paper.");
  });

  test("runs jobs one at a time and checks the printer once it's its turn", async () => {
    const { fake, printer } = await ready();
    fake.blockWrites(true);
    const first = printer.print(RASTER).catch((reason) => reason);
    const second = printer.print(RASTER).catch((reason) => reason);

    fake.send(COVER_OPEN);

    expect(await first).toBeInstanceOf(PrinterUnavailableError);
    expect((await second).conditions).toEqual(["cover-open"]);
  });

  test("a fault mid-job aborts it at once", async () => {
    const { fake, printer } = await ready();
    fake.blockWrites(true);
    const job = printer.print(RASTER).catch((reason) => reason);
    await Bun.sleep(5);
    const faultAt = Date.now();

    fake.send(PAPER_OUT);
    const error = await job;

    expect(error).toBeInstanceOf(PrinterUnavailableError);
    expect(Date.now() - faultAt).toBeLessThan(50);
  });

  test("after an aborted job, the next one clears the printer's buffer first", async () => {
    const { fake, printer } = await ready();
    fake.blockWrites(true);
    const job = printer.print(RASTER).catch(() => {});
    await Bun.sleep(5);
    fake.send(COVER_OPEN);
    await job;
    fake.blockWrites(false);
    fake.send(READY);
    await waitFor(() => printer.getStatus().canPrint);

    await printer.print(RASTER);

    expect(hexes(fake.writes).at(-1)).toBe(
      Buffer.concat([
        DLE_DC4_CLEAR_BUFFERS,
        framePrintJob(RASTER, { asb: true }),
      ]).toString("hex"),
    );
  });

  test("a job that stalls gives up after the stall delay", async () => {
    const { fake, printer } = await ready();
    fake.blockWrites(true);

    const error = await printer.print(RASTER).catch((reason) => reason);

    expect(error).toBeInstanceOf(PrinterUnavailableError);
    expect(error.message).toBe("Printer not ready (stalled).");
  });

  test("with status checks off, prints through a fault but not when unplugged", async () => {
    const { fake, printer } = await ready();
    fake.send(COVER_OPEN);
    await waitFor(() => !printer.getStatus().canPrint);

    await printer.print(RASTER, { enforceStatus: false });
    fake.unplug();
    await waitFor(() => printer.getStatus().conditions[0] === "disconnected");
    const error = await printer
      .print(RASTER, { enforceStatus: false })
      .catch((reason) => reason);

    expect(error.conditions).toEqual(["disconnected"]);
  });
});
