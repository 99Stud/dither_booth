import type { DrawResult } from "@dither-booth/shared/lottery";

import { COUNTDOWN_START } from "./Experience.constants";

export type ExperiencePhase =
  | "idle"
  | "introExiting"
  | "cameraEntering"
  | "promptEntering"
  | "countdown"
  | "smile"
  | "capturing"
  | "preparing"
  | "spinning"
  | "slotResult"
  | "instructions"
  | "printing"
  | "cameraExiting"
  | "receiptReady"
  | "resetting"
  | "resettingButtonRepositioning"
  | "resettingButtonRevealing";

export interface ExperienceState {
  phase: ExperiencePhase;
  countdown: number | null;
  drawResult: DrawResult | null;
  /** Object URL of the captured square, shown as the frozen frame. */
  photoUrl: string | null;
  /** Ref of the receipt the API is holding for us until the game is over. */
  ticketRef: string | null;
  nextPrintAttemptId: number;
  activePrintAttemptId: number | null;
}

export type ExperienceAction =
  | { type: "startRequested" }
  | { type: "startButtonAnimationCompleted" }
  | { type: "cameraAnimationCompleted" }
  | { type: "promptAnimationCompleted" }
  | { type: "countdownTicked" }
  | { type: "smileElapsed" }
  | { type: "reelsStopped" }
  | { type: "slotResultElapsed" }
  | { type: "instructionsElapsed" }
  | { type: "autoResetElapsed" }
  | { type: "photoCaptured"; printAttemptId: number; photoUrl: string }
  | {
      type: "receiptPrepared";
      printAttemptId: number;
      drawResult: DrawResult;
      ticketRef: string;
    }
  | { type: "printSucceeded"; printAttemptId: number }
  | { type: "printFailed"; printAttemptId: number };

export const initialExperienceState: ExperienceState = {
  phase: "idle",
  countdown: null,
  drawResult: null,
  photoUrl: null,
  ticketRef: null,
  nextPrintAttemptId: 1,
  activePrintAttemptId: null,
};

const beginReset = (state: ExperienceState): ExperienceState => ({
  ...state,
  phase: "resetting",
  countdown: null,
  drawResult: null,
  photoUrl: null,
  ticketRef: null,
  activePrintAttemptId: null,
});

const PRINT_ATTEMPT_PHASES: readonly ExperiencePhase[] = [
  "capturing",
  "preparing",
  "spinning",
  "slotResult",
  "instructions",
  "printing",
];

const hasMatchingPrintAttempt = (
  state: ExperienceState,
  printAttemptId: number,
) => state.activePrintAttemptId === printAttemptId;

export const experienceReducer = (
  state: ExperienceState,
  action: ExperienceAction,
): ExperienceState => {
  switch (action.type) {
    case "startRequested": {
      if (state.phase !== "idle") return state;

      return {
        ...state,
        phase: "introExiting",
        countdown: null,
        drawResult: null,
        photoUrl: null,
        ticketRef: null,
        activePrintAttemptId: null,
      };
    }

    case "autoResetElapsed": {
      if (state.phase !== "receiptReady") return state;

      // Camera already exited during cameraExiting — skip resetting wait.
      return {
        ...beginReset(state),
        phase: "resettingButtonRepositioning",
      };
    }

    case "startButtonAnimationCompleted": {
      if (state.phase === "introExiting") {
        return { ...state, phase: "cameraEntering" };
      }

      if (state.phase === "resettingButtonRepositioning") {
        return { ...state, phase: "resettingButtonRevealing" };
      }

      if (state.phase === "resettingButtonRevealing") {
        return { ...state, phase: "idle" };
      }

      return state;
    }

    case "cameraAnimationCompleted": {
      if (state.phase === "cameraEntering") {
        return { ...state, phase: "promptEntering" };
      }

      if (state.phase === "cameraExiting") {
        return { ...state, phase: "receiptReady" };
      }

      if (state.phase === "resetting") {
        return { ...state, phase: "resettingButtonRepositioning" };
      }

      return state;
    }

    case "promptAnimationCompleted": {
      if (state.phase !== "promptEntering") return state;

      return {
        ...state,
        phase: "countdown",
        countdown: COUNTDOWN_START,
      };
    }

    case "countdownTicked": {
      if (state.phase !== "countdown" || state.countdown === null) return state;

      if (state.countdown <= 1) {
        return {
          ...state,
          phase: "smile",
          countdown: null,
        };
      }

      return {
        ...state,
        countdown: state.countdown - 1,
      };
    }

    case "smileElapsed": {
      if (state.phase !== "smile") return state;

      return {
        ...state,
        phase: "capturing",
        activePrintAttemptId: state.nextPrintAttemptId,
        nextPrintAttemptId: state.nextPrintAttemptId + 1,
      };
    }

    case "photoCaptured": {
      if (
        state.phase !== "capturing" ||
        !hasMatchingPrintAttempt(state, action.printAttemptId)
      ) {
        return state;
      }

      return {
        ...state,
        phase: "preparing",
        photoUrl: action.photoUrl,
      };
    }

    case "receiptPrepared": {
      if (
        state.phase !== "preparing" ||
        !hasMatchingPrintAttempt(state, action.printAttemptId)
      ) {
        return state;
      }

      return {
        ...state,
        phase: "spinning",
        drawResult: action.drawResult,
        ticketRef: action.ticketRef,
      };
    }

    case "reelsStopped": {
      if (state.phase !== "spinning") return state;

      return { ...state, phase: "slotResult" };
    }

    case "slotResultElapsed": {
      if (state.phase !== "slotResult") return state;

      return { ...state, phase: "instructions" };
    }

    case "instructionsElapsed": {
      if (state.phase !== "instructions") return state;

      return { ...state, phase: "printing" };
    }

    case "printSucceeded": {
      if (
        state.phase !== "printing" ||
        !hasMatchingPrintAttempt(state, action.printAttemptId)
      ) {
        return state;
      }

      return {
        ...state,
        phase: "cameraExiting",
        countdown: null,
        ticketRef: null,
        activePrintAttemptId: null,
      };
    }

    case "printFailed": {
      if (
        !PRINT_ATTEMPT_PHASES.includes(state.phase) ||
        !hasMatchingPrintAttempt(state, action.printAttemptId)
      ) {
        return state;
      }

      return beginReset(state);
    }
  }
};
