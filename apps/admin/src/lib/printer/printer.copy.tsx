import type { MaintenanceReason } from "@dither-booth/shared/kiosk";
import type {
  PrinterCondition,
  PrinterHistoryEntry,
  PrinterStatus,
} from "@dither-booth/shared/printer";

import { PRINTER_CONDITION_LABEL } from "@dither-booth/protocol/heartbeat";
import { format } from "date-fns";

/**
 * How staff read the printer, in one place: the Printer card, the Booth
 * screen card and Health checks all say it the same way.
 */

export type PrinterTone = "success" | "warning" | "destructive" | "muted";

type ConditionCopy = {
  label: string;
  tone: PrinterTone;
  /** What to do about it, or null when there's nothing to do. */
  action: string | null;
  /** Inside a sentence: "In maintenance because …". */
  trouble: string;
};

const READY: ConditionCopy = {
  action: null,
  label: "Ready",
  tone: "success",
  trouble: "the printer can't print",
};

const COPY: Record<PrinterCondition, ConditionCopy> = {
  "paper-near-end": {
    action: "Have a new 80 mm roll ready and swap it between guests.",
    label: PRINTER_CONDITION_LABEL["paper-near-end"],
    tone: "warning",
    trouble: "the printer is running low on paper",
  },
  "paper-out": {
    action: "Load a new 80 mm roll and close the cover.",
    label: PRINTER_CONDITION_LABEL["paper-out"],
    tone: "destructive",
    trouble: "the printer is out of paper",
  },
  "cover-open": {
    action: "Close the printer cover.",
    label: PRINTER_CONDITION_LABEL["cover-open"],
    tone: "destructive",
    trouble: "the printer cover is open",
  },
  error: {
    action:
      "Turn the printer off and on. If it keeps happening, check the cutter for a paper jam.",
    label: PRINTER_CONDITION_LABEL.error,
    tone: "destructive",
    trouble: "the printer reported an error",
  },
  disconnected: {
    action:
      "Check that the printer is on and its USB cable is plugged into the Pi.",
    label: PRINTER_CONDITION_LABEL.disconnected,
    tone: "destructive",
    trouble: "the printer is not connected",
  },
  unknown: {
    action: null,
    label: PRINTER_CONDITION_LABEL.unknown,
    tone: "muted",
    trouble: "the printer isn't answering yet",
  },
};

/** The engine lists conditions most urgent first. */
const primary = (conditions: PrinterCondition[]) =>
  conditions[0] ? COPY[conditions[0]] : READY;

const time = (iso: string) => format(new Date(iso), "HH:mm");

/** The badge in the Printer card's header. `undefined`: still connecting. */
/** Dry run: receipts are previewed, the printer is never opened. */
export const PRINTER_DRY_RUN_COPY = {
  label: "Dry run",
  line: "Receipts are saved as previews, not printed (RECEIPT_PRINT_DRY_RUN).",
} as const;

export const getPrinterBadge = (
  status: PrinterStatus | undefined,
): { label: string; tone: PrinterTone } => {
  const { label, tone } = primary(status?.conditions ?? ["unknown"]);
  return { label, tone };
};

export const getPrinterHistoryLabel = (conditions: PrinterCondition[]) =>
  primary(conditions).label;

const ACTIVITY_LIMIT = 10;

const formatDuration = (ms: number) => {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

/** "Out of paper, cover open": every problem, the most urgent first. */
const describeConditions = (conditions: PrinterCondition[]) => {
  const [first, ...rest] = conditions.map((condition) => COPY[condition].label);
  if (!first) return READY.label;
  return [first, ...rest.map((label) => label.toLowerCase())].join(", ");
};

export type PrinterActivityEntry = {
  at: string;
  /** How long it lasted, or "now" for the current state. */
  duration: string;
  label: string;
  time: string;
};

/**
 * Recent activity as staff read it: the same state reported twice in a row
 * shows once, and each line says how long the printer stayed that way.
 */
export const getPrinterActivity = (
  history: PrinterHistoryEntry[],
): PrinterActivityEntry[] => {
  // Oldest first, to merge runs from their start.
  const runs: Array<{ at: string; label: string }> = [];
  for (const entry of history.toReversed()) {
    const label = describeConditions(entry.conditions);
    if (runs.at(-1)?.label !== label) runs.push({ at: entry.at, label });
  }

  return runs
    .map((run, index) => {
      const next = runs[index + 1];
      return {
        at: run.at,
        duration: next
          ? formatDuration(Date.parse(next.at) - Date.parse(run.at))
          : "now",
        label: run.label,
        time: time(run.at),
      };
    })
    .toReversed()
    .slice(0, ACTIVITY_LIMIT);
};

/** What the printer is doing, and since when. */
export const getPrinterStatusLine = (
  status: Pick<PrinterStatus, "changedAt" | "conditions">,
): string => {
  const { changedAt, conditions } = status;
  const since = time(changedAt);

  switch (conditions[0]) {
    case undefined:
      return "Ready to print.";
    case "paper-near-end":
      return "Paper is running low.";
    case "paper-out":
      return conditions.includes("cover-open")
        ? `Out of paper and the cover is open since ${since}.`
        : `Out of paper since ${since}.`;
    case "cover-open":
      return `Cover open since ${since}.`;
    case "error":
      return `The printer reported an error at ${since}.`;
    case "disconnected":
      return `Not connected since ${since}.`;
    default:
      return "Checking the printer…";
  }
};

/** What staff should do about it, or null when nothing. */
export const getPrinterAction = (status: PrinterStatus) =>
  primary(status.conditions).action;

/** Why the printer can't print, to say inside a sentence. */
export const getPrinterTrouble = ({
  conditions,
}: Pick<PrinterStatus, "conditions">) => primary(conditions).trouble;

/** How the printer affects guests right now, or null when it doesn't. */
export const getPrinterMaintenanceLine = ({
  automatic,
  reasons,
  status,
}: {
  automatic: boolean;
  reasons: MaintenanceReason[];
  status: Pick<PrinterStatus, "canPrint" | "conditions">;
}): string | null => {
  if (reasons.includes("printer")) {
    return "Booth in maintenance until the printer is ready. Guests see “be right back”.";
  }
  // Only once the printer said what's wrong, not while it's still connecting.
  const hasReported = !status.conditions.includes("unknown");
  if (!automatic && !status.canPrint && hasReported) {
    return "Automatic maintenance is off: guests can still start a visit, but their tickets won't print.";
  }
  return null;
};
