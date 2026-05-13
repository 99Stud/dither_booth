import z from "zod";

export const PM2_RESTART_ROUTE_PATH = "/admin/pm2/restart";

export const PM2_RESTART_INVALID_CLOSE_CODE = 1008;
export const PM2_RESTART_INTERNAL_ERROR_CLOSE_CODE = 1011;
export const PM2_RESTART_IDLE_TIMEOUT_MS = 10_000;
export const PM2_RESTART_CONNECT_TIMEOUT_MS = 10_000;
export const PM2_RESTART_PROCESS_TIMEOUT_MS = 30_000;
export const PM2_RESTART_TIMEOUT_SAFETY_MS = 30_000;
export const PM2_RESTART_STATUS_TIMEOUT_MS = 10_000;
export const PM2_RESTART_STATUS_RECONCILE_TIMEOUT_MS =
  PM2_RESTART_STATUS_TIMEOUT_MS * 2;
export const PM2_RESTART_UNKNOWN_STATE_GUARD_MS = 30_000;
export const PM2_RESTART_SERVER_TIMEOUT_MS =
  PM2_RESTART_CONNECT_TIMEOUT_MS +
  PM2_RESTART_PROCESS_TIMEOUT_MS +
  PM2_RESTART_TIMEOUT_SAFETY_MS +
  PM2_RESTART_STATUS_RECONCILE_TIMEOUT_MS +
  PM2_RESTART_UNKNOWN_STATE_GUARD_MS;
export const PM2_RESTART_CLOSE_REASON_MAX_BYTES = 123;

export const pm2RestartServiceSchema = z.enum(["api", "web"]);

export const pm2RestartProcessNamesSchema = z.object({
  api: z.string().trim().min(1),
  web: z.string().trim().min(1),
});

export const pm2RestartFailureCodeSchema = z.enum([
  "invalid-request",
  "restart-in-progress",
  "pm2-connect-failed",
  "pm2-connect-timeout",
  "pm2-restart-failed",
  "pm2-restart-timeout",
  "pm2-status-unknown",
]);

export const pm2RestartRequestSchema = z.object({
  service: pm2RestartServiceSchema,
});

export const pm2RestartResultSchema = z.object({
  ok: z.literal(true),
  processName: z.string(),
  restartedAt: z.string(),
  service: pm2RestartServiceSchema,
});

export const pm2RestartProcessStatusSchema = z.object({
  exists: z.boolean(),
  pid: z.number().optional(),
  processName: z.string(),
  restartTime: z.number().optional(),
  status: z.string().optional(),
});

export const pm2RestartProgressEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("accepted"),
    service: pm2RestartServiceSchema,
    message: z.string(),
  }),
  z.object({
    type: z.literal("resolving-process"),
    service: pm2RestartServiceSchema,
    message: z.string(),
  }),
  z.object({
    type: z.literal("connecting"),
    service: pm2RestartServiceSchema,
    processName: z.string(),
    message: z.string(),
  }),
  z.object({
    type: z.literal("restarting"),
    service: pm2RestartServiceSchema,
    processName: z.string(),
    message: z.string(),
  }),
  z.object({
    type: z.literal("disconnecting"),
    service: pm2RestartServiceSchema,
    processName: z.string(),
    message: z.string(),
  }),
  z.object({
    type: z.literal("completed"),
    result: pm2RestartResultSchema,
    service: pm2RestartServiceSchema,
    processName: z.string(),
    message: z.string(),
  }),
  z.object({
    type: z.literal("failed"),
    code: pm2RestartFailureCodeSchema.optional(),
    error: z.string(),
    message: z.string(),
    service: pm2RestartServiceSchema.optional(),
    processName: z.string().optional(),
  }),
]);
