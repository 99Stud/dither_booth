import { PROTOCOL_VERSION, type Heartbeat } from "./heartbeat.ts";

/**
 * Heartbeats for the states the Hub's rules tell apart, shared by the tests
 * of whoever writes or reads one (the Engine's Courier, the Hub's rules).
 * `changedAt` is a minute before `sentAt` unless a name says otherwise.
 */
const SENT_AT = "2026-10-31T18:00:30.000Z";
const A_MINUTE_AGO = "2026-10-31T17:59:30.000Z";
const LONG_AGO = "2026-10-31T17:00:00.000Z";

const ready: Heartbeat = {
  protocol: PROTOCOL_VERSION,
  version: "0.7.0",
  dryRun: false,
  sentAt: SENT_AT,
  printer: { conditions: [], canPrint: true, changedAt: LONG_AGO },
  maintenance: { on: false, reasons: [] },
};

const printerFault = (
  conditions: Heartbeat["printer"]["conditions"],
  changedAt = A_MINUTE_AGO,
): Heartbeat => ({
  ...ready,
  printer: { conditions, canPrint: false, changedAt },
  maintenance: { on: true, reasons: ["printer"] },
});

export const HEARTBEAT_FIXTURES = {
  ready,
  /** Warns, but the printer still prints. */
  paperNearEnd: {
    ...ready,
    printer: {
      conditions: ["paper-near-end"],
      canPrint: true,
      changedAt: A_MINUTE_AGO,
    },
  },
  paperOut: printerFault(["paper-out"]),
  /** Both grace periods (cover open, disconnected) count from `changedAt`. */
  coverOpenJustNow: printerFault(["cover-open"], "2026-10-31T18:00:20.000Z"),
  coverOpenForAMinute: printerFault(["cover-open"]),
  disconnectedJustNow: printerFault(
    ["disconnected"],
    "2026-10-31T18:00:20.000Z",
  ),
  disconnectedForAMinute: printerFault(["disconnected"]),
  error: printerFault(["error"]),
  /** No status yet (connecting, or dry run): never alerts. */
  unknown: { ...printerFault(["unknown"]), maintenance: ready.maintenance },
  twoConditions: printerFault(["paper-out", "cover-open"]),
  /** Staff's own maintenance, on a working printer: not an alert. */
  manualMaintenance: {
    ...ready,
    maintenance: { on: true, reasons: ["manual"] },
  },
  /** A development booth: never alerts. */
  dryRun: { ...printerFault(["paper-out"]), dryRun: true },
} satisfies Record<string, Heartbeat>;
