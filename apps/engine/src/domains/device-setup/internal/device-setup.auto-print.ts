import { getErrorMessage } from "@dither-booth/shared/errors";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { BoothPrinter } from "#domains/printer/printer.service";

import {
  SETUP_TICKET_MAX_ATTEMPTS,
  SETUP_TICKET_POLL_MS,
} from "./device-setup.constants";

export type SetupTicket = {
  /** What the ticket is for, e.g. the booth's address: a new one prints again. */
  key: string;
  /** Only built when it prints. */
  build: () => Buffer;
};

type TicketPrinter = Pick<BoothPrinter, "getStatus" | "print" | "subscribe">;

type Log = (
  level: "info" | "warn" | "error",
  event: string,
  details?: Record<string, unknown>,
) => void;

const readText = (path: string) =>
  readFile(path, "utf8").then(
    (text) => text.trim(),
    () => undefined,
  );

/** Resolves on the first status that can print, or when `signal` aborts. */
const untilCanPrint = (printer: TicketPrinter, signal: AbortSignal) =>
  new Promise<boolean>((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    if (printer.getStatus().canPrint) {
      resolve(true);
      return;
    }

    const done = (canPrint: boolean) => {
      unsubscribe();
      signal.removeEventListener("abort", onAbort);
      resolve(canPrint);
    };
    const onAbort = () => done(false);
    const unsubscribe = printer.subscribe((status) => {
      if (status.canPrint) done(true);
    });

    signal.addEventListener("abort", onAbort, { once: true });
  });

/** Resolves after `ms`, or as soon as `signal` aborts. */
const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timeout = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timeout);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });

/**
 * Prints the setup ticket once per power-on and again whenever the ticket's
 * key changes, checking every `pollMs`: the booth moving to another network,
 * or onto its own Wi-Fi, which restarts nothing. Staff plugging the booth in
 * at a venue get the way in without a laptop. Waits for a printer that can
 * print: inserting paper is enough to get the ticket.
 */
export function createSetupTicketAutoPrint(options: {
  printer: TicketPrinter;
  bootIdPath: string;
  keyPath: string;
  /** Undefined while there's nothing to print yet (no network). */
  getTicket: () => Promise<SetupTicket | undefined>;
  log: Log;
  pollMs?: number;
}) {
  const controller = new AbortController();
  const { signal } = controller;
  const pollMs = options.pollMs ?? SETUP_TICKET_POLL_MS;

  async function printAndRecord(ticket: SetupTicket, key: string) {
    await options.printer.print(ticket.build(), { content: "escpos" });
    await mkdir(dirname(options.keyPath), { recursive: true });
    await writeFile(options.keyPath, `${key}\n`);
    options.log("info", "setup-ticket-printed", { key: ticket.key });
  }

  async function printIfNew(bootId: string, failures: Map<string, number>) {
    const ticket = await options.getTicket();
    if (!ticket) return;

    const key = `${bootId}:${ticket.key}`;
    const failed = failures.get(key) ?? 0;

    if (failed >= SETUP_TICKET_MAX_ATTEMPTS) return;
    if ((await readText(options.keyPath)) === key) return;

    try {
      await printAndRecord(ticket, key);
    } catch (error) {
      failures.set(key, failed + 1);
      options.log("warn", "setup-ticket-print-failed", {
        attempt: failed + 1,
        error: getErrorMessage(error),
      });
    }
  }

  async function run() {
    const bootId = await readText(options.bootIdPath);

    // No boot id (not Linux): no way to tell a power-on from a restart.
    if (!bootId) return;

    const failures = new Map<string, number>();

    while (!signal.aborted) {
      if (!(await untilCanPrint(options.printer, signal))) return;
      await printIfNew(bootId, failures).catch((error: unknown) => {
        options.log("warn", "setup-ticket-check-failed", {
          error: getErrorMessage(error),
        });
      });
      await pause(pollMs, signal);
    }
  }

  return {
    start() {
      void run().catch((error: unknown) => {
        options.log("error", "setup-ticket-failed", {
          error: getErrorMessage(error),
        });
      });
    },
    stop() {
      controller.abort();
    },
    /**
     * Prints `ticket` now, e.g. one that says why a join failed, and counts
     * it as printed: the next check doesn't print the same ticket again.
     */
    async printNow(ticket: SetupTicket) {
      const bootId = (await readText(options.bootIdPath)) ?? "";
      await printAndRecord(ticket, `${bootId}:${ticket.key}`);
    },
  };
}
