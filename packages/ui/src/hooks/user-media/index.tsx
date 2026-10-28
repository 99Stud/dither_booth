import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  createPhotoCaptureCoordinator,
  type CapturePhotoOptions,
  type PhotoCaptureCoordinator,
  withFrameGrabFallback,
} from "./internal/user-media.capture";
import {
  CAMERA_NO_PICTURE_MESSAGE,
  grabVideoFrame,
  watchFirstFrame,
} from "./internal/user-media.frames";
import { createRestartBudget } from "./internal/user-media.restart";

export type { CapturePhotoOptions } from "./internal/user-media.capture";

export type CameraStatus = "error" | "initializing" | "ready" | "unsupported";

export interface CameraState {
  error: string | null;
  isSecureContext: boolean;
  lastUpdatedAt: number | null;
  status: CameraStatus;
}

export interface UseUserMediaParams {
  onCameraStateChange?: (
    cameraState: CameraState,
    diagnosticError?: unknown,
  ) => void;
  onConstraintFallbackError?: (error: unknown) => void;
  /** `takePhoto` failed with this error; a frame of the live picture stands in. */
  onPhotoCaptureFallback?: (error: unknown) => void;
  /** Shows the camera. The hook attaches the stream to it and reads frames from it. */
  videoRef: RefObject<HTMLVideoElement | null>;
}

/** An open camera that has drawn nothing by then is failed and reopened. */
const FIRST_FRAME_TIMEOUT_MS = 5000;
/** How long a fallback photo waits for a fresh frame before giving up. */
const GRAB_FRAME_TIMEOUT_MS = 1000;
/** How many times in a row the camera reopens by itself. */
const CAMERA_RESTART_LIMIT = 3;
const CAMERA_RESTART_DELAY_MS = 1500;
/** A picture that lasts this long gives the restarts back. */
const CAMERA_STABLE_MS = 30_000;

const CAMERA_STOPPED_MESSAGE = "The camera stopped.";
/**
 * What staff read once the restarts ran out. A reload is not enough: the
 * browser's camera can stay hung across reloads, and closing it fully is
 * what brought the booth's camera back.
 */
const CAMERA_HUNG_ADVICE =
  "Close the browser fully and open the Shutter again.";

const getMaxSquareSide = (track: MediaStreamTrack) => {
  const { width, height } = track.getCapabilities();
  const maxWidth = width?.max;
  const maxHeight = height?.max;

  if (maxWidth === undefined || maxHeight === undefined) {
    return undefined;
  }

  return Math.floor(Math.min(maxWidth, maxHeight));
};

const applySquareConstraints = async (
  track: MediaStreamTrack,
  maxSquareSide?: number,
) => {
  const exactConstraints: MediaTrackConstraints = {
    aspectRatio: {
      exact: 1,
    },
  };

  if (maxSquareSide !== undefined) {
    exactConstraints.width = {
      exact: maxSquareSide,
    };
    exactConstraints.height = {
      exact: maxSquareSide,
    };
  }

  await track.applyConstraints(exactConstraints).catch(() => {
    // Fall back to softer constraints so preview and capture stay usable.
    const idealConstraints: MediaTrackConstraints = {
      aspectRatio: {
        ideal: 1,
      },
    };

    if (maxSquareSide !== undefined) {
      idealConstraints.width = {
        ideal: maxSquareSide,
      };
      idealConstraints.height = {
        ideal: maxSquareSide,
      };
    }

    return track.applyConstraints(idealConstraints);
  });
};

/** Why `getUserMedia` refused, in words staff can act on. */
const describeCameraAccessError = (error: unknown) => {
  const name = error instanceof DOMException ? error.name : undefined;

  switch (name) {
    case "NotAllowedError":
      return "Camera permission denied.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera found.";
    case "NotReadableError":
      return "The camera is in use by another app.";
    default:
      return "Camera access failed.";
  }
};

const createCameraState = (
  status: CameraStatus,
  error: string | null = null,
): CameraState => {
  return {
    error,
    isSecureContext:
      typeof window === "undefined" ? true : window.isSecureContext,
    lastUpdatedAt: Date.now(),
    status,
  };
};

/**
 * Opens the camera into `videoRef`, square where the device allows it, and
 * takes still photos from it. `ready` means a picture is showing, not that
 * the device opened: the first frame flips it. A camera that stops or shows
 * nothing is reported as an error and reopened by itself, up to
 * `CAMERA_RESTART_LIMIT` times in a row (a picture lasting
 * `CAMERA_STABLE_MS` gives them back), before the error is left standing
 * for staff to see in admin.
 */
export const useUserMedia = (params: UseUserMediaParams) => {
  const {
    onCameraStateChange,
    onConstraintFallbackError,
    onPhotoCaptureFallback,
    videoRef,
  } = params;

  const [cameraState, setCameraState] = useState<CameraState>(() =>
    createCameraState("initializing"),
  );
  const cameraStateDiagnosticErrorRef = useRef<unknown>(undefined);
  const lastNotifiedCameraStateRef = useRef<string | null>(null);
  const onCameraStateChangeRef = useRef(onCameraStateChange);
  const onConstraintFallbackErrorRef = useRef(onConstraintFallbackError);
  const onPhotoCaptureFallbackRef = useRef(onPhotoCaptureFallback);
  const captureInitializationRef = useRef<Promise<void> | undefined>(undefined);
  const captureInitializationErrorRef = useRef<unknown>(undefined);
  const photoCaptureCoordinatorRef = useRef<
    PhotoCaptureCoordinator | undefined
  >(undefined);

  onCameraStateChangeRef.current = onCameraStateChange;
  onConstraintFallbackErrorRef.current = onConstraintFallbackError;
  onPhotoCaptureFallbackRef.current = onPhotoCaptureFallback;

  const updateCameraState = useCallback(
    (
      status: CameraStatus,
      error: string | null = null,
      diagnosticError?: unknown,
    ) => {
      cameraStateDiagnosticErrorRef.current = diagnosticError;
      setCameraState(createCameraState(status, error));
    },
    [],
  );

  const clearPhotoCapture = useCallback(() => {
    captureInitializationErrorRef.current = undefined;
    captureInitializationRef.current = undefined;
    photoCaptureCoordinatorRef.current = undefined;
  }, []);

  useEffect(() => {
    const nextNotificationKey = [
      cameraState.status,
      cameraState.error ?? "none",
    ].join(":");

    if (lastNotifiedCameraStateRef.current === nextNotificationKey) {
      return;
    }

    lastNotifiedCameraStateRef.current = nextNotificationKey;
    onCameraStateChangeRef.current?.(
      cameraState,
      cameraStateDiagnosticErrorRef.current,
    );
  }, [cameraState]);

  const getPhotoCaptureCoordinator = useCallback(async () => {
    await captureInitializationRef.current;

    const photoCaptureCoordinator = photoCaptureCoordinatorRef.current;

    if (photoCaptureCoordinator) {
      return photoCaptureCoordinator;
    }

    const captureInitializationError = captureInitializationErrorRef.current;

    if (captureInitializationError instanceof Error) {
      throw captureInitializationError;
    }

    if (captureInitializationError !== undefined) {
      throw new Error("Camera capture initialization failed.");
    }

    throw new Error("Camera is not ready yet.");
  }, []);

  const prewarmPhotoCapture = useCallback(async () => {
    const photoCaptureCoordinator = await getPhotoCaptureCoordinator();
    await photoCaptureCoordinator.prewarmPhotoCapture();
  }, [getPhotoCaptureCoordinator]);

  const takePhoto = useCallback(
    async (photoSettings?: CapturePhotoOptions) => {
      const photoCaptureCoordinator = await getPhotoCaptureCoordinator();
      return await photoCaptureCoordinator.takePhoto(photoSettings);
    },
    [getPhotoCaptureCoordinator],
  );

  useEffect(() => {
    let cancelled = false;
    let active: MediaStream | undefined;
    let stopFrameWatch: (() => void) | undefined;
    let restartTimer: ReturnType<typeof setTimeout> | undefined;
    const restartBudget = createRestartBudget({
      limit: CAMERA_RESTART_LIMIT,
      stableMs: CAMERA_STABLE_MS,
    });

    const stopStream = () => {
      stopFrameWatch?.();
      stopFrameWatch = undefined;
      active?.getTracks().forEach((track) => track.stop());
      active = undefined;
      clearPhotoCapture();
    };

    /**
     * The camera stopped or gives no picture. Reopen it after a pause, a
     * few times in a row; past that, the error stands and says what staff
     * must do.
     */
    const failAndRestart = (message: string, diagnosticError?: unknown) => {
      if (cancelled) return;

      stopStream();

      const canRestart = restartBudget.take();

      updateCameraState(
        "error",
        canRestart ? message : `${message} ${CAMERA_HUNG_ADVICE}`,
        diagnosticError,
      );

      if (!canRestart) return;

      restartTimer = setTimeout(() => {
        void start();
      }, CAMERA_RESTART_DELAY_MS);
    };

    const start = async () => {
      if (cancelled) return;

      updateCameraState("initializing");

      if (!window.isSecureContext) {
        clearPhotoCapture();
        updateCameraState(
          "unsupported",
          "Camera access requires HTTPS or localhost.",
        );
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        clearPhotoCapture();
        updateCameraState(
          "unsupported",
          "This browser does not support camera capture.",
        );
        return;
      }

      if (typeof ImageCapture === "undefined") {
        clearPhotoCapture();
        updateCameraState(
          "unsupported",
          "This browser does not support still photo capture.",
        );
        return;
      }

      let next: MediaStream;

      try {
        next = await navigator.mediaDevices.getUserMedia({ video: true });
      } catch (e) {
        if (cancelled) return;
        clearPhotoCapture();
        updateCameraState("error", describeCameraAccessError(e), e);
        return;
      }

      if (cancelled) {
        next.getTracks().forEach((track) => track.stop());
        return;
      }

      active = next;

      const track = next.getVideoTracks()[0];

      if (!track) {
        clearPhotoCapture();
        updateCameraState("error", "Camera did not provide a video track.");
        return;
      }

      // Only the stream this run opened is heard; a restart's old one is not.
      const isCurrent = () => !cancelled && active === next;
      // Set by the first frame. An unmute before it is not a picture.
      let hasPicture = false;

      // The camera can go away after it started: unplugged, or taken by
      // the system (a call, another app), which mutes it until it's back.
      track.addEventListener("ended", () => {
        if (!isCurrent()) return;
        failAndRestart(CAMERA_STOPPED_MESSAGE);
      });
      track.addEventListener("mute", () => {
        if (!isCurrent()) return;
        updateCameraState("error", "The camera is paused by the system.");
      });
      track.addEventListener("unmute", () => {
        if (
          !isCurrent() ||
          !hasPicture ||
          !photoCaptureCoordinatorRef.current
        ) {
          return;
        }
        updateCameraState("ready");
      });

      const maxSquareSide = getMaxSquareSide(track);

      await applySquareConstraints(track, maxSquareSide).catch((e) => {
        captureInitializationErrorRef.current = e;
        onConstraintFallbackErrorRef.current?.(e);
      });

      if (!isCurrent()) return;

      const video = videoRef.current;

      if (!video) {
        stopStream();
        updateCameraState("error", "Nothing to show the camera in.");
        return;
      }

      video.srcObject = next;

      captureInitializationRef.current = (async () => {
        const imageCapture = new ImageCapture(track);

        if (!isCurrent() || track.readyState !== "live") {
          return;
        }

        captureInitializationErrorRef.current = undefined;

        const capturePhoto = withFrameGrabFallback({
          takePhoto: (photoSettings) => imageCapture.takePhoto(photoSettings),
          grabFrame: () => grabVideoFrame(video, GRAB_FRAME_TIMEOUT_MS),
          onFallback: (error) => onPhotoCaptureFallbackRef.current?.(error),
        });

        photoCaptureCoordinatorRef.current = createPhotoCaptureCoordinator(
          async (photoSettings?: CapturePhotoOptions) => {
            if (!isCurrent() || track.readyState !== "live") {
              throw new DOMException(
                "Video track is no longer live.",
                "InvalidStateError",
              );
            }

            return await capturePhoto(photoSettings);
          },
        );
      })().catch((error) => {
        if (!isCurrent()) {
          return;
        }

        photoCaptureCoordinatorRef.current = undefined;
        captureInitializationErrorRef.current = error;
        updateCameraState("error", "Camera initialization failed.", error);
      });

      // Ready means a picture, not an open device.
      stopFrameWatch = watchFirstFrame(video, {
        timeoutMs: FIRST_FRAME_TIMEOUT_MS,
        onFrame: () => {
          if (!isCurrent() || !photoCaptureCoordinatorRef.current) return;
          hasPicture = true;
          restartBudget.pictureShown();
          updateCameraState("ready");
        },
        onTimeout: () => {
          if (!isCurrent()) return;
          failAndRestart(CAMERA_NO_PICTURE_MESSAGE);
        },
      });
    };

    void start();

    return () => {
      cancelled = true;
      clearTimeout(restartTimer);
      restartBudget.dispose();
      stopStream();
    };
  }, [clearPhotoCapture, updateCameraState, videoRef]);

  return {
    cameraState,
    prewarmPhotoCapture,
    takePhoto,
  };
};
