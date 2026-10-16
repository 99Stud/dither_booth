import z from "zod";

/**
 * Live view of the booth camera: WebRTC signalling relayed by the engine
 * between the kiosk page that owns the camera (publisher) and a viewer
 * (admin today, Studio over Bell later). The video itself never goes
 * through the engine.
 */

/** Generous for one video m-line; anything bigger is not a real SDP. */
const MAX_SDP_LENGTH = 20_000;
const MAX_CANDIDATE_LENGTH = 1_000;

export const CAMERA_PREVIEW_END_REASONS = [
  /** The viewer stopped, closed the page or lost its stream. */
  "viewer-left",
  /** The kiosk page went away (reload, Darkroom, network). */
  "page-left",
  /** The kiosk page has no camera track to send right now. */
  "camera-off",
  /** No kiosk page with a working camera when the viewer asked. */
  "no-camera",
  /** Too many viewers already. */
  "busy",
  /** The session reached its maximum length. */
  "timeout",
  /** The WebRTC connection could not be made or broke. */
  "failed",
] as const;

export const cameraPreviewSessionIdSchema = z.string().trim().min(1).max(64);

/** `RTCIceServer`, as the engine hands it to both sides. */
export const cameraIceServerSchema = z.object({
  urls: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  username: z.string().optional(),
  credential: z.string().optional(),
});

/** `RTCIceCandidateInit`; null marks the end of the candidates. */
const cameraIceCandidateSchema = z.object({
  candidate: z.string().max(MAX_CANDIDATE_LENGTH),
  sdpMid: z.string().max(64).nullable().optional(),
  sdpMLineIndex: z.number().int().min(0).nullable().optional(),
  usernameFragment: z.string().max(256).nullable().optional(),
});

/** One step of a live view session, in either direction. */
export const cameraSignalSchema = z.discriminatedUnion("kind", [
  /** Engine → both sides: the session is on, with the ICE servers to use. */
  z.object({
    kind: z.literal("start"),
    iceServers: z.array(cameraIceServerSchema),
  }),
  /** Publisher → viewer. */
  z.object({
    kind: z.literal("offer"),
    sdp: z.string().min(1).max(MAX_SDP_LENGTH),
  }),
  /** Viewer → publisher. */
  z.object({
    kind: z.literal("answer"),
    sdp: z.string().min(1).max(MAX_SDP_LENGTH),
  }),
  z.object({
    kind: z.literal("candidate"),
    candidate: cameraIceCandidateSchema.nullable(),
  }),
  z.object({
    kind: z.literal("end"),
    reason: z.enum(CAMERA_PREVIEW_END_REASONS),
  }),
]);

export type CameraPreviewEndReason =
  (typeof CAMERA_PREVIEW_END_REASONS)[number];
export type CameraIceServer = z.infer<typeof cameraIceServerSchema>;
export type CameraSignal = z.infer<typeof cameraSignalSchema>;
