import { z } from "zod";

/**
 * What a booth tells the Hub every 30 seconds. It carries the booth's state,
 * not events, so a retry or a repeat is harmless. The Hub opens and closes
 * alerts by comparing it with the last one.
 *
 * No runtime-specific APIs and no imports but zod: the Engine (Bun) and the
 * Hub's Edge Functions (Deno) read the same schema. The names below are the
 * printer watch's and kiosk maintenance's own; the tests fail if they drift.
 */

/** Bumped when a field changes meaning. The Hub is to read N and N−1. */
export const PROTOCOL_VERSION = 0;

export const PRINTER_CONDITIONS = [
  "paper-near-end",
  "paper-out",
  "cover-open",
  "error",
  "disconnected",
  "unknown",
] as const;

export const printerConditionSchema = z.enum(PRINTER_CONDITIONS);

export const MAINTENANCE_REASONS = ["manual", "printer"] as const;

export const maintenanceReasonSchema = z.enum(MAINTENANCE_REASONS);

/**
 * How a job of `booth update` or `booth rollback` ends, or stands: the
 * states its status file carries. `failed`: the booth still runs what it
 * ran. `rolled-back`: the new release didn't start, and the booth went
 * back. The Hub's `booth_update.state` check holds the same words.
 */
export const BOOTH_JOB_STATES = [
  "running",
  "done",
  "failed",
  "rolled-back",
] as const;

export type BoothJobState = (typeof BOOTH_JOB_STATES)[number];

/**
 * How a booth stands with an update Studio asked for, as it reports it.
 * `waiting`: it got the request and waits for a quiet moment (`error`
 * says why). Then its job's own states.
 */
export const BOOTH_UPDATE_REPORT_STATES = [
  "waiting",
  ...BOOTH_JOB_STATES,
] as const;

/**
 * A request's state on the Hub: `requested` until the booth answers,
 * then what the booth reports.
 */
export const BOOTH_UPDATE_REQUEST_STATES = [
  "requested",
  ...BOOTH_UPDATE_REPORT_STATES,
] as const;

export type BoothUpdateRequestState =
  (typeof BOOTH_UPDATE_REQUEST_STATES)[number];

export const boothUpdateReportSchema = z.object({
  /** The release asked for. */
  release: z.string().trim().min(1).max(64),
  state: z.enum(BOOTH_UPDATE_REPORT_STATES),
  error: z.string().max(500).nullable(),
});

export type BoothUpdateReport = z.infer<typeof boothUpdateReportSchema>;

export const heartbeatSchema = z.object({
  /** Any number reads here; the Hub decides which ones it supports. */
  protocol: z.number().int().min(0),
  /** The release the booth runs. */
  release: z.string().trim().min(1).max(64),
  /** A booth in dry-run (development) never raises an alert. */
  dryRun: z.boolean(),
  sentAt: z.iso.datetime(),
  printer: z.object({
    /** Most urgent first; empty when the printer is ready. */
    conditions: z.array(printerConditionSchema).max(PRINTER_CONDITIONS.length),
    canPrint: z.boolean(),
    /** When `conditions` last changed, which the Hub's grace periods count from. */
    changedAt: z.iso.datetime(),
  }),
  maintenance: z.object({
    on: z.boolean(),
    reasons: z.array(maintenanceReasonSchema).max(MAINTENANCE_REASONS.length),
  }),
  /**
   * The active event's lottery. `stockLeft`: units left across its prizes,
   * 0 when it is off. A booth from before it never sends it; a Hub from
   * before it drops it.
   */
  lottery: z
    .object({
      live: z.boolean(),
      stockLeft: z.number().int().min(0),
    })
    .optional(),
  /**
   * Only while Studio has asked this booth to update. A booth from before
   * it never sends it; a Hub from before it drops it.
   */
  update: boothUpdateReportSchema.optional(),
});

/**
 * The event a booth is at, as the Hub books it: when it is on. The booth
 * keeps its own start and end for its stats (decision 0012).
 */
export const currentEventSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
});

export type CurrentEvent = z.infer<typeof currentEventSchema>;

/**
 * The Hub's answer to a heartbeat. `update`: the release Studio asked this
 * booth to install, until the booth reports it running. `event`: the event
 * the booth is at now, or null. A booth from before either ignores it, and
 * an event it can't read is none, so it never costs the update.
 */
export const heartbeatReplySchema = z.object({
  ok: z.literal(true),
  update: z.object({ release: z.string().min(1).max(64) }).nullish(),
  event: currentEventSchema.nullish().catch(null),
});

export type HeartbeatReply = z.infer<typeof heartbeatReplySchema>;

export type Heartbeat = z.infer<typeof heartbeatSchema>;
export type HeartbeatLottery = NonNullable<Heartbeat["lottery"]>;
export type PrinterCondition = z.infer<typeof printerConditionSchema>;

/** The glossary's word for each condition, as staff read it everywhere. */
export const PRINTER_CONDITION_LABEL: Record<PrinterCondition, string> = {
  "paper-near-end": "Paper low",
  "paper-out": "Out of paper",
  "cover-open": "Cover open",
  error: "Printer error",
  disconnected: "Not connected",
  unknown: "Checking…",
};
