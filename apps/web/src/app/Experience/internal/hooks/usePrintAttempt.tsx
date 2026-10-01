import type { WebcamHandle } from "@dither-booth/ui/components/misc/Webcam";
import type { Dispatch, RefObject } from "react";

import { takeSquarePhotoAndFlipHorizontally } from "@dither-booth/ui/lib/image-manipulation";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { WEB_CAMERA_LOG_SOURCE } from "#lib/constants";
import { reportKioskError } from "#lib/logging/logging.utils";
import { queryClient, useTRPC } from "#lib/trpc/trpc.client";

import type { ExperienceAction, ExperiencePhase } from "../Experience.machine";

import { PRINT_ATTEMPT_TIMEOUT_MS } from "../Experience.constants";
import { hasPhaseFlag } from "../Experience.phases";

interface UsePrintAttemptOptions {
  activePrintAttemptId: number | null;
  dispatch: Dispatch<ExperienceAction>;
  phase: ExperiencePhase;
  photoUrl: string | null;
  ticketRef: string | null;
  webcamRef: RefObject<WebcamHandle | null>;
}

/**
 * Drives a single print attempt in two halves. First, capture the photo and
 * hand it to the API, which commits the lottery draw and renders the receipt
 * while the slot machine plays. Second, once the machine reaches `printing`,
 * ask the API to print the receipt it prepared. Every dispatch carries the
 * attempt id so a late result from a superseded attempt is ignored by the
 * reducer.
 */
export const usePrintAttempt = ({
  activePrintAttemptId,
  dispatch,
  phase,
  photoUrl,
  ticketRef,
  webcamRef,
}: UsePrintAttemptOptions) => {
  const trpc = useTRPC();

  const { mutateAsync: prepareReceipt } = useMutation(
    trpc.prepareReceipt.mutationOptions(),
  );
  const { mutateAsync: printPreparedReceipt } = useMutation(
    trpc.printPreparedReceipt.mutationOptions(),
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

  const reportFailure = useCallback(
    (error: unknown, printAttemptId: number, event: string) => {
      reportKioskError(error, {
        event,
        source: WEB_CAMERA_LOG_SOURCE,
        userMessage: "Print receipt failed.",
      });
      dispatch({ type: "printFailed", printAttemptId });
    },
    [dispatch],
  );

  useEffect(() => {
    if (activePrintAttemptId === null) return;

    const printAttemptId = activePrintAttemptId;

    let cancelled = false;

    const captureAndPrepare = async () => {
      try {
        const squarePhoto = await takeSquarePhoto();

        if (cancelled) return;

        dispatch({
          type: "photoCaptured",
          printAttemptId,
          photoUrl: URL.createObjectURL(squarePhoto),
        });

        const prepared = await prepareReceipt(squarePhoto);

        if (cancelled) return;

        dispatch({
          type: "receiptPrepared",
          printAttemptId,
          drawResult: prepared.draw,
          ticketRef: prepared.ticketRef,
        });
        void queryClient.invalidateQueries(trpc.getLotteryStatus.queryFilter());
      } catch (error) {
        if (cancelled) return;

        reportFailure(
          error,
          printAttemptId,
          "experience-prepare-receipt-failed",
        );
      }
    };

    void captureAndPrepare();

    return () => {
      cancelled = true;
    };
  }, [
    activePrintAttemptId,
    dispatch,
    prepareReceipt,
    reportFailure,
    takeSquarePhoto,
    trpc.getLotteryStatus,
  ]);

  useEffect(() => {
    if (
      phase !== "printing" ||
      activePrintAttemptId === null ||
      ticketRef === null
    ) {
      return;
    }

    const printAttemptId = activePrintAttemptId;

    let cancelled = false;

    const print = async () => {
      try {
        await printPreparedReceipt({ ticketRef });

        if (cancelled) return;

        dispatch({ type: "printSucceeded", printAttemptId });
      } catch (error) {
        if (cancelled) return;

        reportFailure(error, printAttemptId, "experience-print-receipt-failed");
      }
    };

    void print();

    return () => {
      cancelled = true;
    };
  }, [
    activePrintAttemptId,
    dispatch,
    phase,
    printPreparedReceipt,
    reportFailure,
    ticketRef,
  ]);

  // The frozen frame is an object URL; release the previous one once the
  // machine lets go of it. Revoking in an effect cleanup would also fire on
  // StrictMode's simulated remount and kill the frame still on screen.
  const photoUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const previousPhotoUrl = photoUrlRef.current;

    if (previousPhotoUrl !== null && previousPhotoUrl !== photoUrl) {
      URL.revokeObjectURL(previousPhotoUrl);
    }

    photoUrlRef.current = photoUrl;
  }, [photoUrl]);

  useEffect(
    () => () => {
      if (photoUrlRef.current !== null) {
        URL.revokeObjectURL(photoUrlRef.current);
      }
    },
    [],
  );

  // Stays a bespoke effect rather than a usePhaseTimeout call: it also restarts
  // on activePrintAttemptId, which the hook's phase-only deps cannot express.
  useEffect(() => {
    if (activePrintAttemptId === null || !hasPhaseFlag(phase, "printAttempt")) {
      return;
    }

    const printAttemptId = activePrintAttemptId;

    // Capturing, preparing and printing each get their own budget, so a slow
    // printer cannot exhaust the time the camera still needs.
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
