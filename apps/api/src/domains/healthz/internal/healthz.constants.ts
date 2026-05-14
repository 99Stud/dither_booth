import z from "zod";

export const API_HEALTHZ_SERVICE = "api";
export const WEB_HEALTHZ_SERVICE = "web";

export const healthzModeSchema = z.enum(["development", "production"]);

const healthzPayloadBaseSchema = z.object({
  ok: z.literal(true),
  mode: healthzModeSchema,
  timestamp: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Invalid ISO timestamp.",
  }),
});

export const apiHealthzPayloadSchema = healthzPayloadBaseSchema.extend({
  service: z.literal(API_HEALTHZ_SERVICE),
});

export const webHealthzPayloadSchema = healthzPayloadBaseSchema.extend({
  service: z.literal(WEB_HEALTHZ_SERVICE),
});

export const DEPENDENCY_HEALTHZ_TIMEOUT_MS = 1000;
export const WEB_HEALTHZ_TIMEOUT_MS = 5000;
