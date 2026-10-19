import type { PrinterCondition } from "./printer.types";

/**
 * One open connection to the printer. The booth printer holds it for as long
 * as the printer stays plugged in.
 */
export type PrinterLink = {
  /**
   * What the printer sent since the last read. Empty when it had nothing:
   * the TM-T20III answers an idle poll with a zero-length packet. Rejects
   * when the printer is gone.
   */
  read: () => Promise<Buffer>;
  /**
   * Resolves once the printer took every byte (into its buffer, not yet on
   * paper). Aborting cancels the transfer and rejects with the signal's
   * reason.
   */
  write: (bytes: Buffer, signal?: AbortSignal) => Promise<void>;
  /** Waits for transfers in flight, then releases the printer. */
  close: () => Promise<void>;
};

/** How the booth printer reaches the hardware: USB on the booth, a fake in tests. */
export type PrinterTransport = {
  /** Rejects with `PrinterNotFoundError` when no printer is plugged in. */
  open: () => Promise<PrinterLink>;
  /** Called when a printer is plugged in. Returns the unsubscribe. */
  onAttach: (listener: () => void) => () => void;
};

export class PrinterNotFoundError extends Error {
  constructor() {
    super("No receipt printer on USB.");
    this.name = "PrinterNotFoundError";
  }
}

/** The printer was unplugged or switched off while connected. */
export class PrinterGoneError extends Error {
  constructor(cause?: unknown) {
    super("The receipt printer went away.", { cause });
    this.name = "PrinterGoneError";
  }
}

const CONDITION_TEXT: Record<PrinterCondition, string> = {
  "paper-near-end": "paper low",
  "paper-out": "out of paper",
  "cover-open": "cover open",
  error: "printer error",
  disconnected: "not connected",
  unknown: "status unknown",
};

/** The printer can't take this job. The message is staff-readable. */
export class PrinterUnavailableError extends Error {
  readonly conditions: PrinterCondition[];

  constructor(conditions: PrinterCondition[], detail?: string) {
    const what = conditions.map((condition) => CONDITION_TEXT[condition]);

    super(
      `Printer not ready${what.length ? `: ${what.join(", ")}` : ""}${detail ? ` (${detail})` : ""}.`,
    );
    this.name = "PrinterUnavailableError";
    this.conditions = conditions;
  }
}
