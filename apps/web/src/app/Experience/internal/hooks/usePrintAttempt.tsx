import type { WebcamHandle } from "@dither-booth/ui/components/misc/Webcam";
import type { Dispatch, RefObject } from "react";

import { takeSquarePhotoAndFlipHorizontally } from "@dither-booth/ui/lib/image-manipulation";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

import { WEB_CAMERA_LOG_SOURCE } from "#lib/constants";
import { reportKioskError } from "#lib/logging/logging.utils";
import { useTRPC } from "#lib/trpc/trpc.client";

import type { ExperienceAction, ExperiencePhase } from "../Experience.machine";

import { PRINT_ATTEMPT_TIMEOUT_MS } from "../Experience.constants";
import { hasPhaseFlag } from "../Experience.phases";

interface UsePrintAttemptOptions {
  activePrintAttemptId: number | null;
  dispatch: Dispatch<ExperienceAction>;
  phase: ExperiencePhase;
  webcamRef: RefObject<WebcamHandle | null>;
}

/**
 * Drives a single print attempt: capture the photo, hand it to the API, and
 * report the outcome back to the machine. Every dispatch carries the attempt id
 * so a late result from a superseded attempt is ignored by the reducer.
 */
export const usePrintAttempt = ({
  activePrintAttemptId,
  dispatch,
  phase,
  webcamRef,
}: UsePrintAttemptOptions) => {
  const trpc = useTRPC();

  const { mutateAsync: printReceiptImage } = useMutation(
    trpc.printReceipt.mutationOptions(),
  );

  const takeSquarePhoto = useCallback(async () => {
    return await takeSquarePhotoAndFlipHorizontally(
      WEB_CAMERA_LOG_SOURCE,
      async () => {
        if (!webcamRef.current) {
          throw new Error("Camera is not available.");
        }

        return await webcamRef.current.takePhoto();
      },
    );
  }, [webcamRef]);

  useEffect(() => {
    if (activePrintAttemptId === null) return;

    const printAttemptId = activePrintAttemptId;

    let cancelled = false;

    const printReceipt = async () => {
      try {
        const squarePhoto = await takeSquarePhoto();

        if (cancelled) return;

        dispatch({
          type: "photoCaptured",
          printAttemptId,
        });
        await printReceiptImage(squarePhoto);

        if (cancelled) return;

        dispatch({
          type: "printSucceeded",
          printAttemptId,
        });
      } catch (error) {
        if (cancelled) return;

        reportKioskError(error, {
          event: "experience-print-receipt-failed",
          source: WEB_CAMERA_LOG_SOURCE,
          userMessage: "Print receipt failed.",
        });
        dispatch({
          type: "printFailed",
          printAttemptId,
        });
      }
    };

    void printReceipt();

    return () => {
      cancelled = true;
    };
  }, [activePrintAttemptId, dispatch, printReceiptImage, takeSquarePhoto]);

  // Stays a bespoke effect rather than a usePhaseTimeout call: it also restarts
  // on activePrintAttemptId, which the hook's phase-only deps cannot express.
  useEffect(() => {
    if (activePrintAttemptId === null || !hasPhaseFlag(phase, "printAttempt")) {
      return;
    }

    const printAttemptId = activePrintAttemptId;

    // Capturing and printing each get their own budget, so a slow printer
    // cannot exhaust the time the camera still needs.
    const timeoutId = window.setTimeout(() => {
      reportKioskError(new Error(`Print attempt ${printAttemptId} stalled.`), {
        event: "experience-print-attempt-timed-out",
        source: WEB_CAMERA_LOG_SOURCE,
        userMessage: "Print receipt timed out.",
      });
      dispatch({
        type: "printFailed",
        printAttemptId,
      });
    }, PRINT_ATTEMPT_TIMEOUT_MS);

    return () => window.clearTimeout(timeoutId);
  }, [activePrintAttemptId, dispatch, phase]);
};
