import z from "zod";

export const VISIT_LOG_SOURCE = "engine.visit";

/** A visit id as the kiosk sends it back: cuid2, or `backfill-<draw id>`. */
export const visitIdSchema = z.string().min(1).max(64);
