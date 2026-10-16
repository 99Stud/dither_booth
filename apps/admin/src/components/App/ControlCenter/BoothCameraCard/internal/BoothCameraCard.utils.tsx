import type { CameraViewerState } from "@dither-booth/shared/browser/camera-preview";
import type { CameraPreviewEndReason } from "@dither-booth/shared/camera-preview";
import type { KioskCamera, KioskScreen } from "@dither-booth/shared/kiosk";

/** The viewer's state, plus `idle` before the first watch. */
export type LiveViewState = { status: "idle" } | CameraViewerState;

/** What the booth reports, from `ops.getHealthz` (undefined while unknown). */
export type BoothCameraReport = {
  /** The booth screen's mode; undefined while it is offline. */
  screen: KioskScreen | undefined;
  /** The photo booth page's camera, null while it runs none. */
  camera: KioskCamera | null | undefined;
  cameraViewers: number;
  isUnreachable: boolean;
};

const MAX_VIEWERS = 2;

const ENDED_MESSAGES: Partial<Record<CameraPreviewEndReason, string>> = {
  timeout: "Stopped after 10 minutes, to spare the iPad.",
  "page-left": "The booth screen closed the camera.",
  "camera-off": "The booth screen closed the camera.",
  busy: `${MAX_VIEWERS} people are already watching.`,
  failed:
    "Couldn't reach the booth camera. Live view works on the booth's Wi-Fi for now.",
};

/** Why a new live view can't start right now, or null when it can. */
const getUnavailableReason = ({
  screen,
  camera,
  cameraViewers,
  isUnreachable,
}: BoothCameraReport): string | null => {
  if (isUnreachable) return "Can't reach the booth.";
  if (screen === undefined) return "The booth screen is offline.";
  if (screen === "darkroom") {
    return "The camera is off while the Darkroom is open.";
  }
  if (camera?.status === "error" || camera?.status === "unsupported") {
    return "The booth camera isn't working. See Health checks.";
  }
  if (camera?.status !== "ready") return "The booth camera is starting…";
  if (cameraViewers >= MAX_VIEWERS) {
    return `${MAX_VIEWERS} people are already watching.`;
  }
  return null;
};

/**
 * The Booth camera card's action and status line: whether Watch live can
 * start, and the one line to show, if any. Why a view ended wins over why a
 * new one can't start, since that's what the person just saw happen.
 */
export const getLiveViewStatus = (
  view: LiveViewState,
  report: BoothCameraReport,
): { canWatch: boolean; message: string | null } => {
  if (view.status === "connecting") {
    return { canWatch: false, message: "Connecting to the booth camera…" };
  }
  if (view.status === "live") return { canWatch: false, message: null };

  const unavailable = getUnavailableReason(report);
  const ended =
    view.status === "ended" && view.reason !== "no-camera"
      ? (ENDED_MESSAGES[view.reason] ?? null)
      : null;

  return { canWatch: unavailable === null, message: ended ?? unavailable };
};

/** `mm:ss` since the view went live. */
export const formatLiveDuration = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};
