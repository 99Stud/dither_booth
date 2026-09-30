import { COUNTDOWN_START } from "./Experience.constants";

export type ExperiencePhase =
  | "idle"
  | "introExiting"
  | "cameraEntering"
  | "promptEntering"
  | "countdown"
  | "smile"
  | "capturing"
  | "printing"
  | "cameraExiting"
  | "receiptReady"
  | "cashMachine"
  | "lotteryResults"
  | "resetting"
  | "resettingButtonRepositioning"
  | "resettingButtonRevealing";

export interface ExperienceState {
  phase: ExperiencePhase;
  countdown: number | null;
  nextPrintAttemptId: number;
  activePrintAttemptId: number | null;
}

export type ExperienceAction =
  | { type: "startRequested" }
  | { type: "playLotteryRequested" }
  | { type: "startButtonAnimationCompleted" }
  | { type: "cameraAnimationCompleted" }
  | { type: "promptAnimationCompleted" }
  | { type: "countdownTicked" }
  | { type: "smileElapsed" }
  | { type: "cashMachineElapsed" }
  | { type: "autoResetElapsed" }
  | { type: "photoCaptured"; printAttemptId: number }
  | { type: "printSucceeded"; printAttemptId: number }
  | { type: "printFailed"; printAttemptId: number };

export const initialExperienceState: ExperienceState = {
  phase: "idle",
  countdown: null,
  nextPrintAttemptId: 1,
  activePrintAttemptId: null,
};

const beginReset = (state: ExperienceState): ExperienceState => ({
  ...state,
  phase: "resetting",
  countdown: null,
  activePrintAttemptId: null,
});

const canAutoReset = (phase: ExperiencePhase) =>
  phase === "receiptReady" || phase === "lotteryResults";

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
        activePrintAttemptId: null,
      };
    }

    case "autoResetElapsed": {
      if (!canAutoReset(state.phase)) return state;

      // Camera already exited during cameraExiting — skip resetting wait.
      return {
        ...beginReset(state),
        phase: "resettingButtonRepositioning",
      };
    }

    case "playLotteryRequested": {
      if (state.phase !== "receiptReady") return state;

      return {
        ...state,
        phase: "cashMachine",
      };
    }

    case "cashMachineElapsed": {
      if (state.phase !== "cashMachine") return state;

      return {
        ...state,
        phase: "lotteryResults",
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
        return {
          ...state,
          phase: "receiptReady",
        };
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
        phase: "cameraExiting",
        countdown: null,
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
  }
};
