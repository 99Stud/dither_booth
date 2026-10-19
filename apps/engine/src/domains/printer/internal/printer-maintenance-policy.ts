import { logKioskEvent } from "@dither-booth/logging";

import { ENGINE_PRINTER_LOG_SOURCE } from "#lib/printer/printer.constants";

import type { BoothPrinter } from "./booth-printer";
import type { PrinterCondition, PrinterStatus } from "./printer.types";

export type PrinterMaintenanceDelays = {
  /** Paper out, cover open, error: long enough to ignore a quick open-and-shut. */
  enterMs: number;
  /** Unplugged or not answering: covers a restart or a quick replug. */
  disconnectMs: number;
  /** Printing again for this long ends it. */
  leaveMs: number;
};

export const DEFAULT_PRINTER_MAINTENANCE_DELAYS: PrinterMaintenanceDelays = {
  disconnectMs: 10_000,
  enterMs: 3_000,
  leaveMs: 3_000,
};

const CONNECTION: readonly PrinterCondition[] = ["disconnected", "unknown"];

/** Not connected or not answering yet, as opposed to a printer that reported. */
const isConnectionOnly = (status: PrinterStatus) =>
  status.conditions.length > 0 &&
  status.conditions.every((condition) => CONNECTION.includes(condition));

/**
 * Turns the printer's status into the `printer` maintenance reason: on once
 * the printer has been unable to print for a moment, off once it has printed
 * again for a moment. Whether that closes the booth is up to maintenance
 * (staff can turn automatic maintenance off).
 */
export function createPrinterMaintenancePolicy({
  delays = DEFAULT_PRINTER_MAINTENANCE_DELAYS,
  log = (event, details) =>
    logKioskEvent("info", ENGINE_PRINTER_LOG_SOURCE, event, { details }),
  maintenance,
  printer,
}: {
  delays?: PrinterMaintenanceDelays;
  log?: (event: string, details: Record<string, unknown>) => void;
  maintenance: { setPrinterFault: (active: boolean) => unknown };
  printer: Pick<BoothPrinter, "getStatus" | "subscribe">;
}) {
  let fault = false;
  /** Whether the printer has reported anything since start. */
  let heard = false;
  let unprintableSince: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | undefined;

  const clearTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  const setFault = (active: boolean, status: PrinterStatus) => {
    clearTimer();
    if (active === fault) return;

    fault = active;
    maintenance.setPrinterFault(active);
    log(active ? "printer-maintenance-entered" : "printer-maintenance-left", {
      conditions: status.conditions,
    });
  };

  function evaluate(status: PrinterStatus) {
    const firstReading = !heard && !isConnectionOnly(status);
    if (firstReading) heard = true;

    if (status.canPrint) {
      unprintableSince = undefined;
      if (!fault) return clearTimer();
      if (!timer) {
        timer = setTimeout(() => setFault(false, status), delays.leaveMs);
      }
      return;
    }

    unprintableSince ??= performance.now();
    if (fault) return clearTimer();

    // After a restart, the printer's first word is the truth: a cover left
    // open closes the booth at once instead of letting a guest in.
    if (firstReading) return setFault(true, status);

    const delay = isConnectionOnly(status)
      ? delays.disconnectMs
      : delays.enterMs;
    const remaining = unprintableSince + delay - performance.now();
    if (remaining <= 0) return setFault(true, status);

    clearTimer();
    timer = setTimeout(() => setFault(true, printer.getStatus()), remaining);
  }

  return {
    start() {
      unsubscribe = printer.subscribe(evaluate);
      evaluate(printer.getStatus());
    },
    stop() {
      unsubscribe?.();
      unsubscribe = undefined;
      clearTimer();
    },
  };
}
