import type { BoothPrinter } from "./booth-printer";
import type { PrinterStatus } from "./printer.types";

import {
  PrinterGoneError,
  type PrinterLink,
  PrinterNotFoundError,
  type PrinterTransport,
} from "./printer.transport";

/**
 * A printer in memory: tests script what it sends, read what it got, and
 * unplug or block it. Reads come back empty after 1 ms, like the real
 * printer's zero-length packets.
 */
export function createFakeTransport({ present = true } = {}) {
  const attachListeners = new Set<() => void>();
  const writes: Buffer[] = [];
  let inbox: Buffer[] = [];
  let plugged = present;
  let openError: Error | undefined;
  let blockWrites = false;
  let current: { gone: boolean } | undefined;
  let opens = 0;

  const transport: PrinterTransport = {
    async open() {
      opens += 1;
      if (openError) throw openError;
      if (!plugged) throw new PrinterNotFoundError();

      const link = { gone: false };
      current = link;
      inbox = [];

      const printerLink: PrinterLink = {
        async read() {
          await Bun.sleep(1);
          if (link.gone) throw new PrinterGoneError();
          return inbox.shift() ?? Buffer.alloc(0);
        },
        async write(bytes, signal) {
          if (link.gone) throw new PrinterGoneError();
          if (!blockWrites) {
            writes.push(Buffer.from(bytes));
            return;
          }

          await new Promise<void>((_resolve, reject) => {
            const fail = () => reject(signal?.reason ?? new Error("aborted"));
            if (signal?.aborted) return fail();
            signal?.addEventListener("abort", fail, { once: true });
          });
        },
        async close() {
          link.gone = true;
        },
      };

      return printerLink;
    },
    onAttach(listener) {
      attachListeners.add(listener);
      return () => attachListeners.delete(listener);
    },
  };

  return {
    transport,
    /** Every write the printer took, in order, across reconnects. */
    writes,
    get opens() {
      return opens;
    },
    /** Queues bytes for the next read, e.g. an ASB packet as hex. */
    send(hex: string) {
      inbox.push(Buffer.from(hex.replaceAll(" ", ""), "hex"));
    },
    unplug() {
      plugged = false;
      if (current) current.gone = true;
    },
    plugIn() {
      plugged = true;
      for (const listener of attachListeners) listener();
    },
    failOpen(error: Error | undefined) {
      openError = error;
    },
    /** Writes hang until their signal aborts, like a printer that stopped. */
    blockWrites(block: boolean) {
      blockWrites = block;
    },
    get attachListenerCount() {
      return attachListeners.size;
    },
  };
}

/** Polls until `check` passes or `timeoutMs` runs out. */
export async function waitFor(
  check: () => boolean,
  timeoutMs = 500,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (!check()) {
    if (Date.now() > deadline) throw new Error("waitFor timed out");
    await Bun.sleep(1);
  }
}

const READY_STATUS: PrinterStatus = {
  canPrint: true,
  changedAt: "2026-10-19T14:02:00.000Z",
  checkedAt: "2026-10-19T14:02:00.000Z",
  conditions: [],
  history: [],
  lastError: null,
  offline: false,
  raw: "1400000f",
};

/**
 * A printer for tests of its callers: ready by default, with the status and
 * `print` a test needs.
 */
export function createStubPrinter({
  print = async () => {},
  status = {},
}: {
  print?: BoothPrinter["print"];
  status?: Partial<PrinterStatus>;
} = {}): BoothPrinter & { setStatus: (next: Partial<PrinterStatus>) => void } {
  let current: PrinterStatus = { ...READY_STATUS, ...status };

  return {
    dryRun: false,
    getStatus: () => current,
    print,
    isPrinting: () => false,
    setStatus(next) {
      current = { ...current, ...next };
    },
    start: () => {},
    stop: async () => {},
    subscribe: () => () => {},
    async *watch() {
      yield current;
    },
  };
}
