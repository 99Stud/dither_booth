import type { WebcamHandle } from "@dither-booth/ui/components/misc/Webcam";
import type { RefObject } from "react";

import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import { useEffect } from "react";

import { WEB_CAMERA_LOG_SOURCE } from "#lib/constants";

import type { ExperiencePhase } from "../Experience.machine";

interface UseWebcamPrewarmOptions {
  phase: ExperiencePhase;
  webcamRef: RefObject<WebcamHandle | null>;
}

/**
 * Warms up the photo capture pipeline while the intro is still sliding away, so
 * the shutter is not paying camera start-up cost at the end of the countdown.
 */
export const useWebcamPrewarm = ({
  phase,
  webcamRef,
}: UseWebcamPrewarmOptions) => {
  useEffect(() => {
    if (phase !== "introExiting") return;

    const prewarmPromise = webcamRef.current?.prewarmPhotoCapture();
    // Prewarming is a best-effort optimisation; capture still works without it.
    void prewarmPromise?.catch((error: unknown) => {
      logKioskEvent(
        "warn",
        WEB_CAMERA_LOG_SOURCE,
        "experience-camera-prewarm-failed",
        { error: getKioskErrorDiagnostics(error, "Camera prewarm failed.") },
      );
    });
  }, [phase, webcamRef]);
};
