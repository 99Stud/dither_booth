import { useCallback, useEffect, useRef, useState } from "react";

import {
  createPhotoCaptureCoordinator,
  type CapturePhotoOptions,
  type PhotoCaptureCoordinator,
} from "./internal/user-media.capture";

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
  onStream: (stream: MediaStream) => void;
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

export const useUserMedia = (params: UseUserMediaParams) => {
  const { onCameraStateChange, onConstraintFallbackError, onStream } = params;

  const [cameraState, setCameraState] = useState<CameraState>(() =>
    createCameraState("initializing"),
  );
  const cameraStateDiagnosticErrorRef = useRef<unknown>(undefined);
  const lastNotifiedCameraStateRef = useRef<string | null>(null);
  const onCameraStateChangeRef = useRef(onCameraStateChange);
  const onConstraintFallbackErrorRef = useRef(onConstraintFallbackError);
  const onStreamRef = useRef(onStream);
  const captureInitializationRef = useRef<Promise<void> | undefined>(undefined);
  const captureInitializationErrorRef = useRef<unknown>(undefined);
  const photoCaptureCoordinatorRef = useRef<
    PhotoCaptureCoordinator | undefined
  >(undefined);

  onCameraStateChangeRef.current = onCameraStateChange;
  onConstraintFallbackErrorRef.current = onConstraintFallbackError;
  onStreamRef.current = onStream;

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
    let active: MediaStream | undefined;
    let cancelled = false;

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

          await applySquareConstraints(track, maxSquareSide).catch((e) => {
            captureInitializationErrorRef.current = e;
            onConstraintFallbackErrorRef.current?.(e);
          });

          if (!cancelled) {
            captureInitializationRef.current = (async () => {
              const imageCapture = new ImageCapture(track);

              if (cancelled || track.readyState !== "live") {
                return;
              }

              captureInitializationErrorRef.current = undefined;
              updateCameraState("ready");
              photoCaptureCoordinatorRef.current =
                createPhotoCaptureCoordinator(
                  async (photoSettings?: CapturePhotoOptions) => {
                    if (cancelled || track.readyState !== "live") {
                      throw new DOMException(
                        "Video track is no longer live.",
                        "InvalidStateError",
                      );
                    }

                    return await imageCapture.takePhoto(photoSettings);
                  },
                );
            })().catch((error) => {
              if (cancelled) {
                return;
              }

              photoCaptureCoordinatorRef.current = undefined;
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
          clearPhotoCapture();
          updateCameraState("error", "Camera did not provide a video track.");
        }
      })
      .catch((e) => {
        if (cancelled) return;
        clearPhotoCapture();
        updateCameraState("error", "Camera access failed.", e);
      });

    return () => {
      cancelled = true;
      clearPhotoCapture();
      active?.getTracks().forEach((track) => track.stop());
    };
  }, [clearPhotoCapture, updateCameraState]);

  return {
    cameraState,
    prewarmPhotoCapture,
    takePhoto,
  };
};
