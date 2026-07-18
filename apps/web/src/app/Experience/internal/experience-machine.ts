import type { DrawResult } from "@dither-booth/shared/lottery";

export const COUNTDOWN_START = 3;
export const LOTTERY_PENDING_MS = 5_000;
export const LOTTERY_RESULT_DWELL_MS = 12_000;
export const PRINT_SUCCESS_AUTO_RESET_MS =
  LOTTERY_PENDING_MS + LOTTERY_RESULT_DWELL_MS;
export const RESTART_COUNTDOWN_START = 12;

export type ExperiencePhase =
  | "idle"
  | "introExiting"
  | "cameraEntering"
  | "promptEntering"
  | "countdown"
  | "smile"
  | "capturing"
  | "printing"
  | "printSucceeded"
  | "resetting"
  | "resettingButtonRepositioning"
  | "resettingButtonRevealing";

export interface ExperienceState {
  phase: ExperiencePhase;
  countdown: number | null;
  restartCountdown: number | null;
  showLotteryResult: boolean;
  drawResult: DrawResult | null;
  nextPrintAttemptId: number;
  activePrintAttemptId: number | null;
}

export type ExperienceAction =
  | { type: "startRequested" }
  | { type: "restartRequested" }
  | { type: "startButtonAnimationCompleted" }
  | { type: "cameraAnimationCompleted" }
  | { type: "promptAnimationCompleted" }
  | { type: "promptTextAnimationCompleted" }
  | { type: "countdownTicked" }
  | { type: "restartCountdownTicked" }
  | { type: "lotteryRevealElapsed" }
  | { type: "autoResetElapsed" }
  | { type: "photoCaptured"; printAttemptId: number }
  | {
      type: "printSucceeded";
      printAttemptId: number;
      drawResult: DrawResult;
    }
  | { type: "printFailed"; printAttemptId: number };

export const initialExperienceState: ExperienceState = {
  phase: "idle",
  countdown: null,
  restartCountdown: null,
  showLotteryResult: false,
  drawResult: null,
  nextPrintAttemptId: 1,
  activePrintAttemptId: null,
};

const beginReset = (state: ExperienceState): ExperienceState => ({
  ...state,
  phase: "resetting",
  countdown: null,
  restartCountdown: null,
  showLotteryResult: false,
  drawResult: null,
  activePrintAttemptId: null,
});

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
        restartCountdown: null,
        showLotteryResult: false,
        drawResult: null,
        activePrintAttemptId: null,
      };
    }

    case "restartRequested":
    case "autoResetElapsed": {
      if (state.phase !== "printSucceeded") return state;

      return beginReset(state);
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

    case "promptTextAnimationCompleted": {
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
        phase: "printing",
      };
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
        phase: "printSucceeded",
        countdown: null,
        restartCountdown: null,
        showLotteryResult: false,
        drawResult: action.drawResult,
        activePrintAttemptId: null,
      };
    }

    case "printFailed": {
      if (
        (state.phase !== "capturing" && state.phase !== "printing") ||
        !hasMatchingPrintAttempt(state, action.printAttemptId)
      ) {
        return state;
      }

      return beginReset(state);
    }

    case "lotteryRevealElapsed": {
      if (state.phase !== "printSucceeded" || state.showLotteryResult) {
        return state;
      }

      return {
        ...state,
        showLotteryResult: true,
        restartCountdown: RESTART_COUNTDOWN_START,
      };
    }

    case "restartCountdownTicked": {
      if (
        state.phase !== "printSucceeded" ||
        !state.showLotteryResult ||
        state.restartCountdown === null
      ) {
        return state;
      }

      return {
        ...state,
        restartCountdown:
          state.restartCountdown <= 1 ? null : state.restartCountdown - 1,
      };
    }
  }
};
