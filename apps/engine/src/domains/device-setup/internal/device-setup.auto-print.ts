import { getErrorMessage } from "@dither-booth/shared/errors";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { BoothPrinter } from "#domains/printer/printer.service";

import { SETUP_TICKET_MAX_ATTEMPTS } from "./device-setup.constants";

export type SetupTicket = {
  /** What the ticket is for, e.g. the booth's address: a new one prints again. */
  key: string;
  body: Buffer;
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

/**
 * Prints the setup ticket once per power-on and again whenever the ticket's
 * key changes (the booth moved to another network), so staff plugging the
 * booth in at a venue get the way in without a laptop. Waits for a printer
 * that can print: inserting paper is enough to get the ticket.
 */
export function createSetupTicketAutoPrint(options: {
  printer: TicketPrinter;
  bootIdPath: string;
  keyPath: string;
  getTicket: () => Promise<SetupTicket>;
  log: Log;
}) {
  const controller = new AbortController();

  async function run() {
    const bootId = await readText(options.bootIdPath);

    // No boot id (not Linux): no way to tell a power-on from a restart.
    if (!bootId) return;

    for (let attempt = 1; attempt <= SETUP_TICKET_MAX_ATTEMPTS; attempt++) {
      if (!(await untilCanPrint(options.printer, controller.signal))) return;

      const ticket = await options.getTicket();
      const key = `${bootId}:${ticket.key}`;

      if ((await readText(options.keyPath)) === key) return;

      try {
        await options.printer.print(ticket.body, { content: "escpos" });
        await mkdir(dirname(options.keyPath), { recursive: true });
        await writeFile(options.keyPath, `${key}\n`);
        options.log("info", "setup-ticket-printed", { key: ticket.key });
        return;
      } catch (error) {
        options.log("warn", "setup-ticket-print-failed", {
          attempt,
          error: getErrorMessage(error),
        });
      }
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
  };
}
