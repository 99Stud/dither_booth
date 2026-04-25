import { reportKioskError } from "#lib/logging/logging.utils.ts";
import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import { useCallback, useEffect, useRef, useState } from "react";

import { USER_MEDIA_LOG_SOURCE } from "./internal/user-media.constants.ts";

export type CapturePhotoOptions = Omit<
  PhotoSettings,
  "imageWidth" | "imageHeight"
>;

export type CameraStatus = "error" | "initializing" | "ready" | "unsupported";

export interface CameraState {
  error: string | null;
  isSecureContext: boolean;
  lastUpdatedAt: number | null;
  status: CameraStatus;
}

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

  try {
    await track.applyConstraints(exactConstraints);
  } catch {
    // Fall back to softer constraints so the preview and capture stay usable.
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

    await track.applyConstraints(idealConstraints);
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

export const useUserMedia = (params: {
  onStream: (stream: MediaStream) => void;
}) => {
  const { onStream } = params;

  const [cameraState, setCameraState] = useState<CameraState>(() =>
    createCameraState("initializing"),
  );
  const cameraStateDiagnosticErrorRef = useRef<unknown>(undefined);
  const lastLoggedCameraStateRef = useRef<string | null>(null);
  const onStreamRef = useRef(onStream);
  const captureInitializationRef = useRef<Promise<void> | undefined>(undefined);
  const captureInitializationErrorRef = useRef<unknown>(undefined);
  const takePhotoRef = useRef<
    ((photoSettings?: CapturePhotoOptions) => Promise<Blob>) | undefined
  >(undefined);

  onStreamRef.current = onStream;

  const updateCameraState = useCallback(
    (
      status: CameraStatus,
      error: string | null = null,
      diagnosticError?: unknown,
    ) => {
      cameraStateDiagnosticErrorRef.current = diagnosticError;
      const nextCameraState = createCameraState(status, error);
      setCameraState(nextCameraState);
    },
    [],
  );

  const clearTakePhoto = useCallback(() => {
    captureInitializationErrorRef.current = undefined;
    captureInitializationRef.current = undefined;
    takePhotoRef.current = undefined;
  }, []);

  useEffect(() => {
    const nextLogKey = [cameraState.status, cameraState.error ?? "none"].join(
      ":",
    );

    if (lastLoggedCameraStateRef.current === nextLogKey) {
      return;
    }

    lastLoggedCameraStateRef.current = nextLogKey;

    const isCameraFailure =
      cameraState.status === "error" || cameraState.status === "unsupported";

    if (isCameraFailure) {
      const userMessage =
        cameraState.status === "unsupported"
          ? "Camera is not supported in this environment."
          : "Camera failed.";
      const error = cameraStateDiagnosticErrorRef.current;

      reportKioskError(error ?? new Error(cameraState.error ?? userMessage), {
        details: {
          isSecureContext: cameraState.isSecureContext,
          status: cameraState.status,
        },
        event: "camera-state-changed",
        source: USER_MEDIA_LOG_SOURCE,
        userMessage: cameraState.error ?? userMessage,
      });
    } else {
      logKioskEvent("info", USER_MEDIA_LOG_SOURCE, "camera-state-changed", {
        details: {
          error: cameraState.error,
          isSecureContext: cameraState.isSecureContext,
          status: cameraState.status,
        },
      });
    }
  }, [cameraState]);

  const takePhoto = useCallback(async (photoSettings?: CapturePhotoOptions) => {
    await captureInitializationRef.current;

    const capturePhoto = takePhotoRef.current;

    if (capturePhoto) {
      return capturePhoto(photoSettings);
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

  useEffect(() => {
    let active: MediaStream | undefined;
    let cancelled = false;

    updateCameraState("initializing");

    if (!window.isSecureContext) {
      clearTakePhoto();
      updateCameraState(
        "unsupported",
        "Camera access requires HTTPS or localhost.",
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      clearTakePhoto();
      updateCameraState(
        "unsupported",
        "This browser does not support camera capture.",
      );
      return;
    }

    if (typeof ImageCapture === "undefined") {
      clearTakePhoto();
      updateCameraState(
        "unsupported",
        "This browser does not support still photo capture.",
      );
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then(async (next) => {
        if (cancelled) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        active = next;

        const track = next.getVideoTracks()[0];

        if (track) {
          const maxSquareSide = getMaxSquareSide(track);

          try {
            await applySquareConstraints(track, maxSquareSide);
          } catch (e) {
            captureInitializationErrorRef.current = e;
            logKioskEvent(
              "warn",
              USER_MEDIA_LOG_SOURCE,
              "constraint-fallback-failed",
              {
                error: getKioskErrorDiagnostics(
                  e,
                  "Camera constraint fallback failed.",
                ),
              },
            );
          }

          if (!cancelled) {
            captureInitializationRef.current = (async () => {
              const imageCapture = new ImageCapture(track);

              if (cancelled || track.readyState !== "live") {
                return;
              }

              captureInitializationErrorRef.current = undefined;
              updateCameraState("ready");
              takePhotoRef.current = async (
                photoSettings?: CapturePhotoOptions,
              ) => {
                if (cancelled || track.readyState !== "live") {
                  throw new DOMException(
                    "Video track is no longer live.",
                    "InvalidStateError",
                  );
                }

                return await imageCapture.takePhoto(photoSettings);
              };
            })().catch((error) => {
              if (cancelled) {
                return;
              }

              takePhotoRef.current = undefined;
              captureInitializationErrorRef.current = error;
              updateCameraState(
                "error",
                "Camera initialization failed.",
                error,
              );
            });

            onStreamRef.current(next);
          }
        } else {
          clearTakePhoto();
          updateCameraState("error", "Camera did not provide a video track.");
        }
      })
      .catch((e) => {
        if (cancelled) return;
        clearTakePhoto();
        updateCameraState("error", "Camera access failed.", e);
      });

    return () => {
      cancelled = true;
      clearTakePhoto();
      active?.getTracks().forEach((track) => track.stop());
    };
  }, [clearTakePhoto, updateCameraState]);

  return {
    cameraState,
    takePhoto,
  };
};
