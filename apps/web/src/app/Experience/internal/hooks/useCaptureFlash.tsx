import { useEffect, useRef, useState } from "react";

import { CAPTURE_FLASH_HOLD_MS } from "../Experience.motion";

/**
 * Returns the print attempt id whose capture flash is currently on screen.
 *
 * The flash is triggered by a new print attempt starting, not by the `capturing`
 * phase: that phase ends as soon as the photo resolves, which is camera latency
 * rather than a shutter duration, so it would clip a fast capture's fade and let
 * a slow one linger.
 *
 * The trigger and the hold are separate effects on purpose. A single effect keyed
 * on `activePrintAttemptId` would have its cleanup run when the id goes back to
 * null on printSucceeded/printFailed, cancelling the hold timer and leaving the
 * overlay mounted forever. Keying the hold on the flashed id instead means its
 * cleanup only fires when a new flash starts or the flash clears itself.
 */
export const useCaptureFlash = (activePrintAttemptId: number | null) => {
  const [flashCaptureId, setFlashCaptureId] = useState<number | null>(null);
  const lastFlashedIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (
      activePrintAttemptId === null ||
      activePrintAttemptId === lastFlashedIdRef.current
    ) {
      return;
    }

    lastFlashedIdRef.current = activePrintAttemptId;
    setFlashCaptureId(activePrintAttemptId);
  }, [activePrintAttemptId]);

  useEffect(() => {
    if (flashCaptureId === null) return;

    const timeoutId = window.setTimeout(() => {
      setFlashCaptureId(null);
    }, CAPTURE_FLASH_HOLD_MS);

    return () => window.clearTimeout(timeoutId);
  }, [flashCaptureId]);

  return flashCaptureId;
};
