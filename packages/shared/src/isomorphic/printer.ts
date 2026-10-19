/**
 * The receipt printer as the engine's printer watch sees it, shared with
 * admin. Why these and not more: docs/specs/printer-watchdog.md.
 */

/** What the printer reports through Automatic Status Back. */
export type PrinterFault =
  | "paper-near-end"
  | "paper-out"
  | "cover-open"
  | "error";

/**
 * The printer's state as staff see it. `disconnected`: not on USB, or the
 * connection failed. `unknown`: no status yet (connecting, or dry run).
 */
export type PrinterCondition = PrinterFault | "disconnected" | "unknown";

export type PrinterHistoryEntry = {
  at: string;
  conditions: PrinterCondition[];
};

export type PrinterStatus = {
  /** Most urgent first; empty when the printer is ready. */
  conditions: PrinterCondition[];
  /** False for paper out, cover open, error, disconnected and unknown. */
  canPrint: boolean;
  /** The printer says it's offline (Feed held counts). */
  offline: boolean;
  /** The last status packet as hex, for debugging. */
  raw: string | null;
  /** When `conditions` last changed. */
  changedAt: string;
  /** When the printer last reported, or a connection was last tried. */
  checkedAt: string;
  /** Why the last connection attempt failed, if it did. */
  lastError: string | null;
  /** The last changes of `conditions`, newest first. */
  history: PrinterHistoryEntry[];
};
