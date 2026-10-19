import type { PrinterStatus } from "#domains/printer/printer.service";

import {
  createHealthyDependencyHealthz,
  createUnhealthyDependencyHealthz,
} from "./healthz.utils";

const NOT_READY_MESSAGE = {
  "cover-open": "Printer cover is open.",
  disconnected: "Printer is not connected.",
  error: "Printer reported an error.",
  "paper-out": "Printer is out of paper.",
  unknown: "Printer status is not known yet.",
} as const;

/**
 * The printer as the printer watch last saw it: healthy while it can print,
 * with paper low as a warning. In dry run nothing is watched.
 */
export function checkPrinterHealthz(
  status: PrinterStatus,
  { dryRun }: { dryRun: boolean },
) {
  const details = {
    canPrint: status.canPrint,
    changedAt: status.changedAt,
    checkedAt: status.checkedAt,
    conditions: status.conditions,
    lastError: status.lastError,
    raw: status.raw,
    /** False in dry run: receipts are previewed and the printer isn't opened. */
    watched: !dryRun,
    warning: status.conditions.includes("paper-near-end")
      ? "Paper is running low."
      : null,
  };

  if (dryRun) {
    return createUnhealthyDependencyHealthz({
      context: details,
      details,
      message: "Printer watch off (RECEIPT_PRINT_DRY_RUN).",
    });
  }

  if (status.canPrint) return createHealthyDependencyHealthz({ details });

  const first = status.conditions.find(
    (condition) => condition !== "paper-near-end",
  );

  return createUnhealthyDependencyHealthz({
    cause: status.lastError ?? undefined,
    context: details,
    details,
    message: first ? NOT_READY_MESSAGE[first] : "Printer can't print.",
  });
}
