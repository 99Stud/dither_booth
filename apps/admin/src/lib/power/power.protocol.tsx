import z from "zod";

/*
 * What `/admin/power` takes and answers, shared by the admin server and
 * the System page.
 */

export const powerActionSchema = z.enum([
  "restart-apps",
  "reboot",
  "power-off",
]);

export type PowerAction = z.infer<typeof powerActionSchema>;

/** A GET's answer. Only the route says this: the page fallback is HTML. */
export const powerAvailabilitySchema = z.object({ available: z.literal(true) });

export type PowerAvailability = z.infer<typeof powerAvailabilitySchema>;

export const powerRequestSchema = z.object({ action: powerActionSchema });

export const powerResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    action: powerActionSchema,
    acceptedAt: z.string(),
  }),
  z.object({
    ok: z.literal(false),
    /** `not-permitted`: the booth's polkit rule is missing or out of date. */
    code: z.enum(["not-permitted", "failed"]),
    message: z.string(),
  }),
]);

export type PowerResult = z.infer<typeof powerResultSchema>;
