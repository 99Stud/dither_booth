import z from "zod";

/**
 * How a kiosk page reloads: `when-idle` waits for the landing screen so a
 * guest's visit is never cut off, `now` reloads straight away.
 */
export const KIOSK_RELOAD_MODES = ["when-idle", "now"] as const;

export const kioskReloadModeSchema = z.enum(KIOSK_RELOAD_MODES);

/**
 * The Shutter screens a kiosk page can show: the guest-facing Experience
 * (`/`) or the staff Darkroom (`/darkroom`).
 */
export const KIOSK_SCREENS = ["shutter", "darkroom"] as const;

export const kioskScreenSchema = z.enum(KIOSK_SCREENS);

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
  z.object({
    type: z.literal("navigate"),
    screen: kioskScreenSchema,
    commandId: z.string().min(1),
  }),
]);

/**
 * The camera of a kiosk page, as the page last reported it. Mirrors the
 * Shutter's `useUserMedia` states.
 */
export const KIOSK_CAMERA_STATUSES = [
  "initializing",
  "ready",
  "error",
  "unsupported",
] as const;

export const kioskCameraSchema = z.object({
  status: z.enum(KIOSK_CAMERA_STATUSES),
  error: z.string().max(200).nullable(),
});

/**
 * What a kiosk page reports about itself (`booth.reportKioskStatus`).
 * `camera` is null while the page runs no camera, e.g. the Darkroom's PIN
 * screen.
 */
export const kioskPageStatusSchema = z.object({
  camera: kioskCameraSchema.nullable(),
});

/** Identifies one kiosk page load on one device, and the screen it shows. */
export const kioskPageSchema = z.object({
  pageId: z.string().trim().min(1).max(64),
  deviceId: z.string().trim().min(1).max(64),
  screen: kioskScreenSchema,
});

export type KioskReloadMode = z.infer<typeof kioskReloadModeSchema>;
export type KioskScreen = z.infer<typeof kioskScreenSchema>;
export type KioskCamera = z.infer<typeof kioskCameraSchema>;
export type KioskPageStatus = z.infer<typeof kioskPageStatusSchema>;
export type KioskCommand = z.infer<typeof KIOSK_COMMAND_SCHEMA>;
export type KioskPage = z.infer<typeof kioskPageSchema>;
