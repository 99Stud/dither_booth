import { logKioskEvent } from "@dither-booth/logging";
import { getErrorMessage } from "@dither-booth/shared/errors";
import { EventEmitter, on } from "node:events";

import { ENGINE_PRINTER_LOG_SOURCE } from "#lib/printer/printer.constants";

import type { PrintJobContent } from "./printer.escpos";
import type {
  PrinterCondition,
  PrinterHistoryEntry,
  PrinterStatus,
} from "./printer.types";

import { createAsbParser, decodeAsb } from "./printer.asb";
import { PRINTER_FLUSH_TIMEOUT_MS } from "./printer.constants";
import {
  DLE_DC4_CLEAR_BUFFERS,
  framePrintJob,
  GS_A_OFF,
  GS_A_ON,
} from "./printer.escpos";
import {
  type PrinterLink,
  type PrinterTransport,
  PrinterUnavailableError,
} from "./printer.transport";

export type BoothPrinterDelays = {
  /** Times GS a is re-sent to a printer that stays silent after connecting. */
  asbRetries: number;
  asbRetryMs: number;
  /** udev sets the device's permissions just after the kernel adds it. */
  attachSettleMs: number;
  /** Wait after a zero-length read before polling again. */
  emptyReadMs: number;
  reconnectMaxMs: number;
  reconnectMinMs: number;
  /** A job that the printer hasn't taken by then is given up. */
  stallMs: number;
};

export const DEFAULT_PRINTER_DELAYS: BoothPrinterDelays = {
  asbRetries: 3,
  asbRetryMs: 2_000,
  attachSettleMs: 500,
  emptyReadMs: 20,
  reconnectMaxMs: 10_000,
  reconnectMinMs: 1_000,
  stallMs: PRINTER_FLUSH_TIMEOUT_MS,
};

type PrinterLog = (
  level: "info" | "warn",
  event: string,
  details?: Record<string, unknown>,
) => void;

const defaultLog: PrinterLog = (level, event, details) =>
  logKioskEvent(level, ENGINE_PRINTER_LOG_SOURCE, event, { details });

/**
 * The receipt printer, watched for as long as the engine runs: it holds the
 * USB connection open, keeps Automatic Status Back on, and prints through
 * the same connection. Why it works this way: apps/docs/src/content/docs/specs/printer-watchdog.md.
 */
export type BoothPrinter = {
  /**
   * True for the preview printer (`RECEIPT_PRINT_DRY_RUN`): tickets are saved
   * as previews, nothing is printed for real, and the Hub never alerts.
   */
  dryRun: boolean;
  start: () => void;
  /** Turns status back off and lets go of the printer. */
  stop: () => Promise<void>;
  getStatus: () => PrinterStatus;
  /** The current status, then every change, until `signal` aborts. */
  watch: (signal?: AbortSignal) => AsyncGenerator<PrinterStatus, void>;
  /** In-process listener for every change. Returns the unsubscribe. */
  subscribe: (listener: (status: PrinterStatus) => void) => () => void;
  /**
   * Prints one job, one at a time. Rejects with
   * `PrinterUnavailableError` when the printer can't take it, or when it
   * faults mid-job. `enforceStatus: false` only refuses a printer that isn't
   * connected: the escape hatch for a sensor that misbehaves. `content` is
   * `"raster"` (a receipt) unless the job is an ESC/POS text ticket.
   */
  print: (
    body: Buffer,
    options?: { content?: PrintJobContent; enforceStatus?: boolean },
  ) => Promise<void>;
};

const STATUS_EVENT = "status";
const STOP_WRITE_TIMEOUT_MS = 500;
const HISTORY_LIMIT = 20;
/** Conditions that stop a print. Paper low doesn't. */
const BLOCKING: readonly PrinterCondition[] = [
  "paper-out",
  "cover-open",
  "error",
  "disconnected",
  "unknown",
];
/** Faults the printer reports mid-job, which abort it. */
const ABORTING: readonly PrinterCondition[] = [
  "paper-out",
  "cover-open",
  "error",
];

const sameConditions = (a: PrinterCondition[], b: PrinterCondition[]) =>
  a.length === b.length &&
  a.every((condition, index) => condition === b[index]);

export function createBoothPrinter({
  delays = DEFAULT_PRINTER_DELAYS,
  log = defaultLog,
  now = Date.now,
  transport,
}: {
  delays?: BoothPrinterDelays;
  log?: PrinterLog;
  now?: () => number;
  transport: PrinterTransport;
}): BoothPrinter {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  const parser = createAsbParser();
  const isoNow = () => new Date(now()).toISOString();

  let status: PrinterStatus = {
    canPrint: false,
    changedAt: isoNow(),
    checkedAt: isoNow(),
    conditions: ["unknown"],
    history: [],
    lastError: null,
    offline: false,
    raw: null,
  };
  let link: PrinterLink | undefined;
  let running = false;
  let loop: Promise<void> | undefined;
  let stopAttach: (() => void) | undefined;
  let wake: (() => void) | undefined;
  let needsBufferClear = false;
  let queue: Promise<unknown> = Promise.resolve();

  function update(next: {
    conditions: PrinterCondition[];
    offline: boolean;
    raw?: string | null;
    lastError?: string | null;
  }) {
    const at = isoNow();
    const conditionsChanged = !sameConditions(
      next.conditions,
      status.conditions,
    );
    const changed = conditionsChanged || next.offline !== status.offline;
    const history: PrinterHistoryEntry[] = conditionsChanged
      ? [{ at, conditions: next.conditions }, ...status.history].slice(
          0,
          HISTORY_LIMIT,
        )
      : status.history;

    status = {
      ...status,
      canPrint: next.conditions.every(
        (condition) => !BLOCKING.includes(condition),
      ),
      changedAt: conditionsChanged ? at : status.changedAt,
      checkedAt: at,
      conditions: next.conditions,
      history,
      lastError:
        next.lastError === undefined ? status.lastError : next.lastError,
      offline: next.offline,
      raw: next.raw === undefined ? status.raw : next.raw,
    };

    if (conditionsChanged) {
      log("info", "printer-status-changed", {
        conditions: status.conditions,
        raw: status.raw,
      });
    }
    if (changed) emitter.emit(STATUS_EVENT, status);
  }

  /** Waits `ms`, or less when a printer is plugged in or the printer stops. */
  const waitOrWake = (ms: number) =>
    new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        wake = undefined;
        resolve();
      };
      const timer = setTimeout(done, ms);
      wake = done;
    });

  async function readUntilGone(current: PrinterLink) {
    let heard = false;
    let resends = 0;
    let armedAt = performance.now();

    while (running && link === current) {
      const bytes = await current.read();

      if (bytes.length === 0) {
        if (!heard && performance.now() - armedAt >= delays.asbRetryMs) {
          if (resends < delays.asbRetries) {
            resends += 1;
            armedAt = performance.now();
            await current.write(GS_A_ON);
          } else if (resends === delays.asbRetries) {
            resends += 1;
            log("warn", "printer-asb-silent", { resends: delays.asbRetries });
          }
        }
        await Bun.sleep(delays.emptyReadMs);
        continue;
      }

      for (const packet of parser.push(bytes)) {
        heard = true;
        update({ ...decodeAsb(packet), raw: packet.toString("hex") });
      }
    }
  }

  async function run(connect: PrinterTransport) {
    let attempt = 0;

    while (running) {
      try {
        const opened = await connect.open();
        if (!running) {
          await opened.close();
          return;
        }

        link = opened;
        attempt = 0;
        parser.reset();
        update({ conditions: ["unknown"], lastError: null, offline: false });
        log("info", "printer-connected");
        await opened.write(GS_A_ON);
        await readUntilGone(opened);
      } catch (error) {
        if (!running) return;

        const message = getErrorMessage(error);
        if (
          status.lastError !== message ||
          !status.conditions.includes("disconnected")
        ) {
          log("warn", "printer-disconnected", { error: message });
        }
        update({
          conditions: ["disconnected"],
          lastError: message,
          offline: false,
        });
      }

      if (link) {
        const closing = link;
        link = undefined;
        await closing.close().catch(() => {});
      }
      if (!running) return;

      attempt += 1;
      await waitOrWake(
        Math.min(
          delays.reconnectMinMs * 2 ** (attempt - 1),
          delays.reconnectMaxMs,
        ),
      );
    }
  }

  async function runJob(
    body: Buffer,
    {
      content,
      enforceStatus,
    }: { content: PrintJobContent; enforceStatus: boolean },
  ) {
    const current = link;
    const { canPrint, conditions } = status;

    if (!current || conditions.includes("disconnected")) {
      throw new PrinterUnavailableError(["disconnected"]);
    }
    if (enforceStatus && !canPrint) {
      throw new PrinterUnavailableError(conditions);
    }

    const bytes = Buffer.concat([
      ...(needsBufferClear ? [DLE_DC4_CLEAR_BUFFERS] : []),
      framePrintJob(body, { asb: true, content }),
    ]);
    const controller = new AbortController();
    const stall = setTimeout(
      () =>
        controller.abort(
          new PrinterUnavailableError(status.conditions, "stalled"),
        ),
      delays.stallMs,
    );
    const stopWatching = subscribe((next) => {
      const fault = next.conditions.some(
        (condition) =>
          condition === "disconnected" ||
          (enforceStatus && ABORTING.includes(condition)),
      );
      if (fault) controller.abort(new PrinterUnavailableError(next.conditions));
    });

    try {
      await current.write(bytes, controller.signal);
      needsBufferClear = false;
    } catch (error) {
      if (!controller.signal.aborted) {
        throw new PrinterUnavailableError(
          status.conditions,
          getErrorMessage(error),
        );
      }
      // The printer may still sit inside the cut-off raster command.
      needsBufferClear = true;
      const reason: unknown = controller.signal.reason;
      log("warn", "printer-job-aborted", { error: getErrorMessage(reason) });
      throw reason;
    } finally {
      clearTimeout(stall);
      stopWatching();
    }
  }

  function subscribe(listener: (next: PrinterStatus) => void) {
    emitter.on(STATUS_EVENT, listener);
    return () => {
      emitter.off(STATUS_EVENT, listener);
    };
  }

  return {
    dryRun: false,
    getStatus: () => status,
    print(body, { content = "raster", enforceStatus = true } = {}) {
      const job = queue.then(() => runJob(body, { content, enforceStatus }));
      queue = job.catch(() => {});
      return job;
    },
    start() {
      if (running) return;

      running = true;
      stopAttach = transport.onAttach(() => {
        setTimeout(() => wake?.(), delays.attachSettleMs);
      });
      loop = run(transport);
    },
    async stop() {
      if (!running) return;

      // Bounded: a printer that stopped taking data must not hang shutdown.
      const current = link;
      if (current) {
        await current
          .write(GS_A_OFF, AbortSignal.timeout(STOP_WRITE_TIMEOUT_MS))
          .catch(() => {});
      }
      running = false;
      stopAttach?.();
      stopAttach = undefined;
      wake?.();
      await loop;
      if (link) {
        await link.close().catch(() => {});
        link = undefined;
      }
    },
    subscribe,
    watch(signal) {
      // Listening starts now, before the snapshot, so no change falls between.
      const changes = on(emitter, STATUS_EVENT, signal ? { signal } : {});
      const snapshot = status;

      return (async function* () {
        try {
          yield snapshot;
          for await (const [next] of changes) {
            yield next as PrinterStatus;
          }
        } catch (error) {
          if (!signal?.aborted) throw error;
        }
      })();
    },
  };
}
