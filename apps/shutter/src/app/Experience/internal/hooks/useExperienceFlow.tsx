import type { WebcamHandle } from "@dither-booth/ui/components/misc/Webcam";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useReducer, useRef } from "react";

import { requestKioskFullscreen } from "#lib/kiosk-fullscreen";
import { queryClient, useTRPC } from "#lib/trpc/trpc.client";

import {
  COUNTDOWN_INTERVAL_MS,
  PHASE_AUTO_ADVANCE_MS,
  INSTRUCTIONS_HOLD_MS,
  SLOT_RESULT_HOLD_MS,
  SMILE_HOLD_MS,
} from "../Experience.constants";
import { getPrompt, isPromptInSquare } from "../Experience.copy";
import {
  experienceReducer,
  initialExperienceState,
} from "../Experience.machine";
import {
  PROMPT_ANIMATION_FALLBACK_MS,
  REELS_ANIMATION_FALLBACK_MS,
  SHUTTER_ANIMATION_FALLBACK_MS,
  SLIDE_ANIMATION_FALLBACK_MS,
} from "../Experience.motion";
import {
  AUTO_ADVANCE_ACTION_BY_PHASE,
  hasPhaseFlag,
} from "../Experience.phases";
import { useCaptureFlash } from "./useCaptureFlash";
import { useExperienceShellClass } from "./useExperienceShellClass";
import { useKioskCommands } from "./useKioskCommands";
import { usePhaseTimeout } from "./usePhaseTimeout";
import { usePrintAttempt } from "./usePrintAttempt";
import { useVisitReport } from "./useVisitReport";
import { useWebcamPrewarm } from "./useWebcamPrewarm";

export const useExperienceFlow = () => {
  const trpc = useTRPC();
  const { data: lotteryStatus } = useQuery(
    trpc.booth.getLotteryStatus.queryOptions(),
  );

  const [state, dispatch] = useReducer(
    experienceReducer,
    initialExperienceState,
  );
  const {
    activePrintAttemptId,
    countdown,
    drawResult,
    hasLottery,
    phase,
    photoUrl,
    ticketRef,
    visitEnd,
    visitId,
  } = state;

  const webcamRef = useRef<WebcamHandle>(null);

  const captureFlashId = useCaptureFlash(activePrintAttemptId);

  useExperienceShellClass();
  const isMaintenance = useKioskCommands(phase, webcamRef);
  useWebcamPrewarm({ phase, webcamRef });
  usePrintAttempt({
    activePrintAttemptId,
    dispatch,
    phase,
    photoUrl,
    ticketRef,
    visitId,
    webcamRef,
  });
  useVisitReport({ dispatch, phase, visitEnd, visitId });

  // Unknown status counts as off. If the engine draws against a lottery
  // anyway, `receiptPrepared` brings the reels in.
  const hasLotteryAtStart = lotteryStatus?.enabled ?? false;

  const handleStartExperience = useCallback(() => {
    void requestKioskFullscreen();
    dispatch({ type: "startRequested", hasLottery: hasLotteryAtStart });
  }, [hasLotteryAtStart]);

  useEffect(() => {
    if (phase !== "idle") return;

    void queryClient.invalidateQueries(
      trpc.booth.getLotteryStatus.queryFilter(),
    );
  }, [phase, trpc.booth.getLotteryStatus]);

  useEffect(() => {
    if (phase !== "countdown") return;

    const intervalId = window.setInterval(() => {
      dispatch({ type: "countdownTicked" });
    }, COUNTDOWN_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [phase]);

  usePhaseTimeout({
    delayMs: SMILE_HOLD_MS,
    isActive: hasPhaseFlag(phase, "smileHold"),
    onElapsed: () => dispatch({ type: "smileElapsed" }),
    phase,
  });

  usePhaseTimeout({
    delayMs: SLOT_RESULT_HOLD_MS,
    isActive: hasPhaseFlag(phase, "slotResultHold"),
    onElapsed: () => dispatch({ type: "slotResultElapsed" }),
    phase,
  });

  usePhaseTimeout({
    delayMs: INSTRUCTIONS_HOLD_MS,
    isActive: hasPhaseFlag(phase, "instructionsHold"),
    onElapsed: () => dispatch({ type: "instructionsElapsed" }),
    phase,
  });

  usePhaseTimeout({
    delayMs: REELS_ANIMATION_FALLBACK_MS,
    isActive: hasPhaseFlag(phase, "reelsAnimationFallback"),
    onElapsed: () => dispatch({ type: "reelsStopped" }),
    phase,
  });

  usePhaseTimeout({
    delayMs: SLIDE_ANIMATION_FALLBACK_MS,
    isActive: hasPhaseFlag(phase, "startButtonAnimationFallback"),
    onElapsed: () => dispatch({ type: "startButtonAnimationCompleted" }),
    phase,
  });

  usePhaseTimeout({
    delayMs: SHUTTER_ANIMATION_FALLBACK_MS,
    isActive: hasPhaseFlag(phase, "cameraAnimationFallback"),
    onElapsed: () => dispatch({ type: "cameraAnimationCompleted" }),
    phase,
  });

  usePhaseTimeout({
    delayMs: PROMPT_ANIMATION_FALLBACK_MS,
    isActive: hasPhaseFlag(phase, "promptAnimationFallback"),
    onElapsed: () => dispatch({ type: "promptAnimationCompleted" }),
    phase,
  });

  usePhaseTimeout({
    delayMs: PHASE_AUTO_ADVANCE_MS,
    isActive: AUTO_ADVANCE_ACTION_BY_PHASE[phase] !== null,
    onElapsed: () => {
      const autoAdvanceAction = AUTO_ADVANCE_ACTION_BY_PHASE[phase];

      if (autoAdvanceAction) dispatch(autoAdvanceAction);
    },
    phase,
  });

  const handleStartButtonAnimationComplete = useCallback(() => {
    dispatch({ type: "startButtonAnimationCompleted" });
  }, []);

  const handleCameraAnimationComplete = useCallback(() => {
    dispatch({ type: "cameraAnimationCompleted" });
  }, []);

  const handlePromptAnimationComplete = useCallback(() => {
    dispatch({ type: "promptAnimationCompleted" });
  }, []);

  const handleReelsStopped = useCallback(() => {
    dispatch({ type: "reelsStopped" });
  }, []);

  const prompt = getPrompt(phase, hasLottery);

  return {
    captureFlashId,
    countdown,
    drawResult,
    handleCameraAnimationComplete,
    handlePromptAnimationComplete,
    handleReelsStopped,
    handleStartButtonAnimationComplete,
    handleStartExperience,
    isCameraVisible: hasPhaseFlag(phase, "cameraVisible"),
    isFrozenPhotoVisible: hasPhaseFlag(phase, "frozenPhoto"),
    isIntroDecorationsVisible:
      hasPhaseFlag(phase, "introDecorations") && !isMaintenance,
    isMaintenance,
    isPostPrintVisible: hasPhaseFlag(phase, "postPrint"),
    isPromptInSquare: isPromptInSquare(prompt, hasLottery),
    isPromptVisible: hasPhaseFlag(phase, "promptVisible"),
    hasLottery,
    isSlotVisible: hasLottery && hasPhaseFlag(phase, "slotVisible"),
    isStartButtonAtOrigin: hasPhaseFlag(phase, "startButtonAtOrigin"),
    // Maintenance hides the start button and refuses a visit.
    isStartButtonVisible:
      hasPhaseFlag(phase, "startButtonVisible") && !isMaintenance,
    isStartDisabled: !hasPhaseFlag(phase, "startEnabled") || isMaintenance,
    lotteryStatus,
    phase,
    photoUrl,
    prompt,
    webcamRef,
  };
};
