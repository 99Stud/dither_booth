import z from "zod";

export const ENGINE_HEALTHZ_SERVICE = "engine";
export const SHUTTER_HEALTHZ_SERVICE = "shutter";
export const ADMIN_HEALTHZ_SERVICE = "admin";

export const healthzServiceSchema = z.enum([
  ENGINE_HEALTHZ_SERVICE,
  SHUTTER_HEALTHZ_SERVICE,
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

export const engineHealthzPayloadSchema = healthzPayloadBaseSchema.extend({
  service: z.literal(ENGINE_HEALTHZ_SERVICE),
  /**
   * Why a restart now would land on a guest (a visit under way, a ticket
   * printing), or null: read by `booth update` before its switch. An
   * engine from before leaves it out.
   */
  busy: z.string().nullable().optional(),
});

export const shutterHealthzPayloadSchema = healthzPayloadBaseSchema.extend({
  service: z.literal(SHUTTER_HEALTHZ_SERVICE),
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
