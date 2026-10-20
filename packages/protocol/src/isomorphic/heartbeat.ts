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
});

export type Heartbeat = z.infer<typeof heartbeatSchema>;
export type PrinterCondition = z.infer<typeof printerConditionSchema>;
