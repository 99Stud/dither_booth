import z from "zod";

/**
 * How a kiosk page reloads: `when-idle` waits for the landing screen so a
 * guest's visit is never cut off, `now` reloads straight away.
 */
export const KIOSK_RELOAD_MODES = ["when-idle", "now"] as const;

export const kioskReloadModeSchema = z.enum(KIOSK_RELOAD_MODES);

/**
 * Commands the engine pushes to the kiosk pages over the kiosk channel
 * (`booth.onKioskCommand`). A discriminated union, so new commands (theme
 * updates, …) are added as new `type`s.
 */
export const KIOSK_COMMAND_SCHEMA = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("reload"),
    mode: kioskReloadModeSchema,
    commandId: z.string().min(1),
  }),
]);

/** Identifies one kiosk page load on one device. */
export const kioskPageSchema = z.object({
  pageId: z.string().trim().min(1).max(64),
  deviceId: z.string().trim().min(1).max(64),
});

export type KioskReloadMode = z.infer<typeof kioskReloadModeSchema>;
export type KioskCommand = z.infer<typeof KIOSK_COMMAND_SCHEMA>;
export type KioskPage = z.infer<typeof kioskPageSchema>;
