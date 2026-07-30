import type { WebcamHandle } from "@dither-booth/ui/components/misc/Webcam";

import { useCallback, useEffect, useReducer, useRef } from "react";

import {
  COUNTDOWN_INTERVAL_MS,
  PHASE_AUTO_ADVANCE_MS,
  SMILE_HOLD_MS,
} from "../Experience.constants";
import { PROMPT_TEXT_BY_PHASE } from "../Experience.copy";
import {
  experienceReducer,
  initialExperienceState,
} from "../Experience.machine";
import {
  PROMPT_ANIMATION_FALLBACK_MS,
  SLIDE_ANIMATION_FALLBACK_MS,
} from "../Experience.motion";
import {
  AUTO_ADVANCE_ACTION_BY_PHASE,
  hasPhaseFlag,
} from "../Experience.phases";
import { useCaptureFlash } from "./useCaptureFlash";
import { useExperienceShellClass } from "./useExperienceShellClass";
import { usePhaseTimeout } from "./usePhaseTimeout";
import { usePrintAttempt } from "./usePrintAttempt";
import { useWebcamPrewarm } from "./useWebcamPrewarm";

export const useExperienceFlow = () => {
  const [state, dispatch] = useReducer(
    experienceReducer,
    initialExperienceState,
  );
  const { activePrintAttemptId, countdown, phase } = state;

  const webcamRef = useRef<WebcamHandle>(null);

  const captureFlashId = useCaptureFlash(activePrintAttemptId);

  useExperienceShellClass();
  useWebcamPrewarm({ phase, webcamRef });
  usePrintAttempt({ activePrintAttemptId, dispatch, phase, webcamRef });

  const handleStartExperience = useCallback(() => {
    dispatch({ type: "startRequested" });
  }, []);

  const handlePlayLottery = useCallback(() => {
    dispatch({ type: "playLotteryRequested" });
  }, []);

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
    delayMs: SLIDE_ANIMATION_FALLBACK_MS,
    isActive: hasPhaseFlag(phase, "startButtonAnimationFallback"),
    onElapsed: () => dispatch({ type: "startButtonAnimationCompleted" }),
    phase,
  });

  usePhaseTimeout({
    delayMs: SLIDE_ANIMATION_FALLBACK_MS,
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

  return {
    captureFlashId,
    countdown,
    handleCameraAnimationComplete,
    handlePlayLottery,
    handlePromptAnimationComplete,
    handleStartButtonAnimationComplete,
    handleStartExperience,
    isCameraVisible: hasPhaseFlag(phase, "cameraVisible"),
    isIntroDecorationsVisible: hasPhaseFlag(phase, "introDecorations"),
    isPostPrintEnteringInPlace: hasPhaseFlag(phase, "postPrintEntersInPlace"),
    isPostPrintVisible: hasPhaseFlag(phase, "postPrint"),
    isPromptVisible: hasPhaseFlag(phase, "promptVisible"),
    isStartButtonAtOrigin: hasPhaseFlag(phase, "startButtonAtOrigin"),
    isStartButtonVisible: hasPhaseFlag(phase, "startButtonVisible"),
    isStartDisabled: !hasPhaseFlag(phase, "startEnabled"),
    phase,
    promptText: PROMPT_TEXT_BY_PHASE[phase],
    webcamRef,
  };
};
