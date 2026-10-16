import type { KioskCamera } from "@dither-booth/shared/kiosk";
import type { CameraState } from "@dither-booth/ui/hooks/user-media";

import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * This page's camera, for the kiosk stream to report to admin. Written by
 * the screen that runs the Webcam (the Experience, the Darkroom's print
 * tuning) and back to null once that screen is gone.
 */
let current: KioskCamera | null = null;
const listeners = new Set<() => void>();

function write(next: KioskCamera | null) {
  current = next;
  for (const listener of listeners) listener();
}

export const useKioskCamera = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => null,
  );

/**
 * Wraps a Webcam's `onCameraStateChange` so the state also reaches the
 * kiosk stream, and clears it when the calling screen unmounts.
 */
export const useKioskCameraReporter = (
  onCameraStateChange: (state: CameraState, diagnosticError?: unknown) => void,
) => {
  useEffect(() => () => write(null), []);

  return useCallback(
    (state: CameraState, diagnosticError?: unknown) => {
      onCameraStateChange(state, diagnosticError);
      write({
        status: state.status,
        error: state.error?.slice(0, 200) ?? null,
      });
    },
    [onCameraStateChange],
  );
};
