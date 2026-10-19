import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PrinterStatus } from "#domains/printer/printer.service";

import { waitFor } from "#domains/printer/internal/printer.test-utils";

import { createSetupTicketAutoPrint } from "./device-setup.auto-print";

const directory = mkdtempSync(join(tmpdir(), "dither-booth-setup-ticket-"));
afterAll(() => rmSync(directory, { force: true, recursive: true }));

const statusOf = (canPrint: boolean): PrinterStatus => ({
  canPrint,
  changedAt: "",
  checkedAt: "",
  conditions: canPrint ? [] : ["paper-out"],
  history: [],
  lastError: null,
  offline: false,
  raw: null,
});

let run = 0;
const running: Array<{ stop: () => void }> = [];
afterEach(() => {
  for (const autoPrint of running.splice(0)) autoPrint.stop();
});

function setup({
  bootId = "boot-1",
  ip = "192.168.1.42",
  canPrint = true,
} = {}) {
  run += 1;
  const bootIdPath = join(directory, `boot-${run}`);
  const keyPath = join(directory, `key-${run}`, "last-ticket");
  writeFileSync(bootIdPath, `${bootId}\n`);

  const emitter = new EventEmitter();
  let status = statusOf(canPrint);
  const printed: Buffer[] = [];
  let address: string | undefined = ip;
  let currentBootId = bootId;

  const start = () => {
    writeFileSync(bootIdPath, `${currentBootId}\n`);
    const autoPrint = createSetupTicketAutoPrint({
      bootIdPath,
      getTicket: async () =>
        address === undefined
          ? undefined
          : { build: () => Buffer.from(address ?? ""), key: address },
      keyPath,
      log: () => {},
      pollMs: 5,
      printer: {
        getStatus: () => status,
        print: async (body) => {
          printed.push(body);
        },
        subscribe: (listener) => {
          emitter.on("status", listener);
          return () => emitter.off("status", listener);
        },
      },
    });
    autoPrint.start();
    running.push(autoPrint);
    return autoPrint;
  };

  return {
    printed,
    start,
    setCanPrint(next: boolean) {
      status = statusOf(next);
      emitter.emit("status", status);
    },
    moveTo(next: string | undefined) {
      address = next;
    },
    reboot(next: string) {
      currentBootId = next;
    },
  };
}

describe("setup ticket auto-print", () => {
  test("prints once per boot: an engine restart doesn't print again", async () => {
    const booth = setup();

    booth.start();
    await waitFor(() => booth.printed.length === 1);
    booth.start();
    await Bun.sleep(20);

    expect(booth.printed).toHaveLength(1);
  });

  test("prints again after a power cycle, or on a new network", async () => {
    const booth = setup();

    booth.start();
    await waitFor(() => booth.printed.length === 1);
    booth.reboot("boot-2");
    booth.start();
    await waitFor(() => booth.printed.length === 2);
    booth.moveTo("10.0.0.7");
    booth.start();
    await waitFor(() => booth.printed.length === 3);

    expect(booth.printed[2]?.toString()).toBe("10.0.0.7");
  });

  test("waits for a printer that can print, then prints", async () => {
    const booth = setup({ canPrint: false });

    booth.start();
    await Bun.sleep(20);
    expect(booth.printed).toHaveLength(0);

    booth.setCanPrint(true);
    await waitFor(() => booth.printed.length === 1);
  });

  test("stop gives up on a ticket still waiting for paper", async () => {
    const booth = setup({ canPrint: false });

    booth.start().stop();
    booth.setCanPrint(true);
    await Bun.sleep(20);

    expect(booth.printed).toHaveLength(0);
  });

  test("follows the network while it runs, without a restart", async () => {
    const booth = setup();

    booth.start();
    await waitFor(() => booth.printed.length === 1);
    booth.moveTo("booth-wifi");
    await waitFor(() => booth.printed.length === 2);

    expect(booth.printed[1]?.toString()).toBe("booth-wifi");
  });

  test("prints nothing between networks", async () => {
    const booth = setup();

    booth.moveTo(undefined);
    booth.start();
    await Bun.sleep(30);
    expect(booth.printed).toHaveLength(0);

    booth.moveTo("10.0.0.7");
    await waitFor(() => booth.printed.length === 1);
  });
});
