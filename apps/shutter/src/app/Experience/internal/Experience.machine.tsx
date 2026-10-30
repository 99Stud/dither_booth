import type { DrawResult } from "@dither-booth/shared/lottery";

import { COUNTDOWN_START } from "./Experience.constants";

export type ExperiencePhase =
  | "idle"
  | "introExiting"
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

/** How a visit ended, as the kiosk reports it to the engine. */
export type VisitEnd = "completed" | "failed";

export interface ExperienceState {
  phase: ExperiencePhase;
  countdown: number | null;
  drawResult: DrawResult | null;
  /**
   * Whether this visit plays the slot machine. Read at Start, so the stage is
   * laid out before the draw; the engine's draw can only turn it on, so a prize
   * is always revealed and the reels never vanish mid-visit.
   */
  hasLottery: boolean;
  /** Object URL of the captured square, shown as the frozen frame. */
  photoUrl: string | null;
  /** Ref of the receipt the engine is holding for us until the game is over. */
  ticketRef: string | null;
  nextPrintAttemptId: number;
  activePrintAttemptId: number | null;
  /**
   * The guest's visit on the engine: from `startVisit`, or from the draw when
   * Start wasn't recorded. Null while unknown; the visit goes on regardless.
   */
  visitId: string | null;
  /** Set once the print succeeded or failed; kept until the next Start. */
  visitEnd: VisitEnd | null;
}

export type ExperienceAction =
  | { type: "startRequested"; hasLottery: boolean }
  | { type: "visitStarted"; visitId: string }
  | { type: "startButtonAnimationCompleted" }
  | { type: "cameraAnimationCompleted" }
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
      /** The engine drew against a lottery, whatever Start assumed. */
      hasLottery: boolean;
      ticketRef: string;
      /** The visit the draw was linked to, when the engine recorded it. */
      visitId: string | null;
    }
  | { type: "printSucceeded"; printAttemptId: number }
  | { type: "printFailed"; printAttemptId: number };

export const initialExperienceState: ExperienceState = {
  phase: "idle",
  countdown: null,
  drawResult: null,
  hasLottery: false,
  photoUrl: null,
  ticketRef: null,
  nextPrintAttemptId: 1,
  activePrintAttemptId: null,
  visitId: null,
  visitEnd: null,
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
        hasLottery: action.hasLottery,
        photoUrl: null,
        ticketRef: null,
        activePrintAttemptId: null,
        visitId: null,
        visitEnd: null,
      };
    }

    case "visitStarted": {
      // Too late once the kiosk is back on the start screen, or once the
      // draw already said which visit this is.
      if (state.phase === "idle" || state.visitId !== null) return state;

      return { ...state, visitId: action.visitId };
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
      if (state.phase === "introExiting") return state;

      if (state.phase === "resettingButtonRepositioning") {
        return { ...state, phase: "resettingButtonRevealing" };
      }

      if (state.phase === "resettingButtonRevealing") {
        return { ...state, phase: "idle" };
      }

      return state;
    }

    case "cameraAnimationCompleted": {
      // The countdown starts as soon as the shutter is open; the caption
      // fades in alongside the first number.
      if (state.phase === "introExiting") {
        return {
          ...state,
          phase: "countdown",
          countdown: COUNTDOWN_START,
        };
      }

      if (state.phase === "cameraExiting") {
        return { ...state, phase: "receiptReady" };
      }

      if (state.phase === "resetting") {
        return { ...state, phase: "resettingButtonRepositioning" };
      }

      return state;
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

      // Without a lottery there is no draw to reveal: print straight away.
      const hasLottery = state.hasLottery || action.hasLottery;

      return {
        ...state,
        hasLottery,
        phase: hasLottery ? "spinning" : "printing",
        drawResult: action.drawResult,
        ticketRef: action.ticketRef,
        visitId: action.visitId ?? state.visitId,
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
        visitEnd: "completed",
      };
    }

    case "printFailed": {
      if (
        !PRINT_ATTEMPT_PHASES.includes(state.phase) ||
        !hasMatchingPrintAttempt(state, action.printAttemptId)
      ) {
        return state;
      }

      return { ...beginReset(state), visitEnd: "failed" };
    }
  }
};
