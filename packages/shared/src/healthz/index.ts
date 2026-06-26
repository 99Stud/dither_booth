import z from "zod";

export const API_HEALTHZ_SERVICE = "api";
export const WEB_HEALTHZ_SERVICE = "web";
export const ADMIN_HEALTHZ_SERVICE = "admin";

export const healthzServiceSchema = z.enum([
  API_HEALTHZ_SERVICE,
  WEB_HEALTHZ_SERVICE,
  ADMIN_HEALTHZ_SERVICE,
]);

export const healthzModeSchema = z.enum(["development", "production"]);

export const healthzPayloadBaseSchema = z.object({
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

export const adminHealthzPayloadSchema = healthzPayloadBaseSchema.extend({
  service: z.literal(ADMIN_HEALTHZ_SERVICE),
});

export type HealthzMode = z.infer<typeof healthzModeSchema>;
export type HealthzService = z.infer<typeof healthzServiceSchema>;

export type HealthzPayload<TService extends string = HealthzService> = {
  ok: true;
  mode: HealthzMode;
  service: TService;
  timestamp: string;
};

export function createHealthzPayload<const TService extends string>({
  mode,
  service,
}: {
  mode: HealthzMode;
  service: TService;
}): HealthzPayload<TService> {
  return {
    ok: true,
    mode,
    service,
    timestamp: new Date().toISOString(),
  };
}
