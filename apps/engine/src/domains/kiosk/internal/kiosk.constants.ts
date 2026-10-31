import type { CameraIceServer } from "@dither-booth/shared/camera-preview";

import { KIOSK_STATUS_REPORT_INTERVAL_MS } from "@dither-booth/shared/kiosk";

export const KIOSK_LOG_SOURCE = "engine.kiosk";

/**
 * A kiosk page that hasn't reported for this long is taken as gone (three
 * missed reports): the iPad is off, asleep or out of Wi-Fi, which closes
 * nothing on the engine's side.
 */
export const KIOSK_STATUS_STALE_AFTER_MS = 3 * KIOSK_STATUS_REPORT_INTERVAL_MS;

/**
 * ICE servers for the booth camera's live view. Empty: on the venue LAN the
 * host candidates connect directly. A relay (coturn on the Pi, or the Hub's
 * short-lived TURN credentials) goes here when a network needs one.
 */
export const CAMERA_PREVIEW_ICE_SERVERS: CameraIceServer[] = [];
/** Each viewer costs the iPad one more video encode. */
export const CAMERA_PREVIEW_MAX_VIEWERS = 2;
/** A forgotten live view stops on its own, to spare the iPad. */
export const CAMERA_PREVIEW_MAX_DURATION_MS = 10 * 60_000;
