import type { Dispatch } from "react";

import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";

import { SHUTTER_CAMERA_LOG_SOURCE } from "#lib/constants";
import { useTRPC } from "#lib/trpc/trpc.client";

import type {
  ExperienceAction,
  ExperiencePhase,
  VisitEnd,
} from "../Experience.machine";

interface UseVisitReportOptions {
  dispatch: Dispatch<ExperienceAction>;
  phase: ExperiencePhase;
  visitEnd: VisitEnd | null;
  visitId: string | null;
}

const logVisitFailure = (event: string, error: unknown) => {
  logKioskEvent("warn", SHUTTER_CAMERA_LOG_SOURCE, event, {
    error: getKioskErrorDiagnostics(error, "Visit not recorded."),
  });
};

/**
 * Tells the engine when a guest's visit starts (the intro leaves, once per
 * Start) and how it ends (the print succeeded or failed). A visit the kiosk
 * never ends is closed by the engine at the next Start. Never in the guest's
 * way: a failed call is logged, not shown.
 */
export const useVisitReport = ({
  dispatch,
  phase,
  visitEnd,
  visitId,
}: UseVisitReportOptions) => {
  const trpc = useTRPC();

  const { mutate: startVisit } = useMutation({
    ...trpc.booth.startVisit.mutationOptions(),
    onSuccess: (started) => {
      if (started.visitId) {
        dispatch({ type: "visitStarted", visitId: started.visitId });
      }
    },
    onError: (error) => logVisitFailure("experience-start-visit-failed", error),
  });
  const { mutate: endVisit } = useMutation({
    ...trpc.booth.endVisit.mutationOptions(),
    onError: (error) => logVisitFailure("experience-end-visit-failed", error),
  });

  useEffect(() => {
    if (phase !== "introExiting") return;

    startVisit();
  }, [phase, startVisit]);

  useEffect(() => {
    if (visitId === null || visitEnd === null) return;

    // The engine keeps the first end, so a repeat is harmless.
    endVisit({ visitId, reason: visitEnd });
  }, [endVisit, visitEnd, visitId]);
};
