import { describe, expect, it } from "bun:test";

import {
  COUNTDOWN_START,
  experienceReducer,
  initialExperienceState,
  RESTART_COUNTDOWN_START,
  type ExperienceAction,
  type ExperienceState,
} from "./experience-machine";

const withPhase = (
  phase: ExperienceState["phase"],
  overrides: Partial<ExperienceState> = {},
): ExperienceState => ({
  ...initialExperienceState,
  phase,
  ...overrides,
});

const reduce = (
  state: ExperienceState,
  ...actions: ExperienceAction[]
): ExperienceState => actions.reduce(experienceReducer, state);

const enterCapturing = (): ExperienceState => {
  const state = reduce(
    withPhase("idle"),
    { type: "startRequested" },
    { type: "startButtonAnimationCompleted" },
    { type: "cameraAnimationCompleted" },
    { type: "promptAnimationCompleted" },
    ...Array.from(
      { length: COUNTDOWN_START },
      (): ExperienceAction => ({ type: "countdownTicked" }),
    ),
    { type: "promptTextAnimationCompleted" },
  );

  expect(state.phase).toBe("capturing");
  return state;
};

describe("experienceReducer", () => {
  it("runs the complete successful experience flow", () => {
    let state = withPhase("idle");

    state = experienceReducer(state, { type: "startRequested" });
    expect(state.phase).toBe("introExiting");

    state = experienceReducer(state, {
      type: "startButtonAnimationCompleted",
    });
    expect(state.phase).toBe("cameraEntering");

    state = experienceReducer(state, { type: "cameraAnimationCompleted" });
    expect(state.phase).toBe("promptEntering");

    state = experienceReducer(state, { type: "promptAnimationCompleted" });
    expect(state).toMatchObject({
      phase: "countdown",
      countdown: COUNTDOWN_START,
    });

    state = experienceReducer(state, { type: "countdownTicked" });
    expect(state.countdown).toBe(2);
    state = experienceReducer(state, { type: "countdownTicked" });
    expect(state.countdown).toBe(1);
    state = experienceReducer(state, { type: "countdownTicked" });
    expect(state).toMatchObject({ phase: "smile", countdown: null });

    state = experienceReducer(state, {
      type: "promptTextAnimationCompleted",
    });
    expect(state).toMatchObject({
      phase: "capturing",
      activePrintAttemptId: 1,
      nextPrintAttemptId: 2,
    });

    state = experienceReducer(state, {
      type: "photoCaptured",
      printAttemptId: 1,
    });
    expect(state.phase).toBe("printing");

    state = experienceReducer(state, {
      type: "printSucceeded",
      printAttemptId: 1,
    });
    expect(state).toMatchObject({
      phase: "printSucceeded",
      activePrintAttemptId: null,
      showLotteryResult: false,
      restartCountdown: null,
    });
  });

  it("starts only one print attempt for duplicate pose completions", () => {
    const capturingState = enterCapturing();
    const duplicateState = experienceReducer(capturingState, {
      type: "promptTextAnimationCompleted",
    });

    expect(duplicateState).toBe(capturingState);
    expect(duplicateState).toMatchObject({
      activePrintAttemptId: 1,
      nextPrintAttemptId: 2,
    });
  });

  it("ignores stale print lifecycle events", () => {
    const capturingState = enterCapturing();

    expect(
      experienceReducer(capturingState, {
        type: "photoCaptured",
        printAttemptId: 999,
      }),
    ).toBe(capturingState);
    expect(
      experienceReducer(capturingState, {
        type: "printFailed",
        printAttemptId: 999,
      }),
    ).toBe(capturingState);

    const printingState = experienceReducer(capturingState, {
      type: "photoCaptured",
      printAttemptId: 1,
    });

    expect(
      experienceReducer(printingState, {
        type: "printSucceeded",
        printAttemptId: 999,
      }),
    ).toBe(printingState);
  });

  it("resets atomically after capture or print failure", () => {
    const capturingState = enterCapturing();
    const failedCaptureState = experienceReducer(capturingState, {
      type: "printFailed",
      printAttemptId: 1,
    });

    expect(failedCaptureState).toMatchObject({
      phase: "resetting",
      countdown: null,
      restartCountdown: null,
      showLotteryResult: false,
      activePrintAttemptId: null,
      nextPrintAttemptId: 2,
    });

    const printingState = experienceReducer(capturingState, {
      type: "photoCaptured",
      printAttemptId: 1,
    });
    const failedPrintState = experienceReducer(printingState, {
      type: "printFailed",
      printAttemptId: 1,
    });

    expect(failedPrintState).toMatchObject({
      phase: "resetting",
      activePrintAttemptId: null,
      nextPrintAttemptId: 2,
    });
  });

  it("reveals the lottery result and advances its countdown", () => {
    let state = experienceReducer(withPhase("printSucceeded"), {
      type: "lotteryRevealElapsed",
    });

    expect(state).toMatchObject({
      showLotteryResult: true,
      restartCountdown: RESTART_COUNTDOWN_START,
    });

    for (
      let remaining = RESTART_COUNTDOWN_START - 1;
      remaining >= 1;
      remaining -= 1
    ) {
      state = experienceReducer(state, { type: "restartCountdownTicked" });
      expect(state.restartCountdown).toBe(remaining);
    }

    state = experienceReducer(state, { type: "restartCountdownTicked" });
    expect(state.restartCountdown).toBeNull();

    const completedState = state;
    expect(experienceReducer(state, { type: "restartCountdownTicked" })).toBe(
      completedState,
    );
  });

  it.each(["restartRequested", "autoResetElapsed"] as const)(
    "runs the complete reset animation chain for %s",
    (type) => {
      const successState = withPhase("printSucceeded", {
        countdown: 2,
        restartCountdown: 4,
        showLotteryResult: true,
        activePrintAttemptId: 3,
        nextPrintAttemptId: 4,
      });

      let state = experienceReducer(successState, { type });
      expect(state).toMatchObject({
        phase: "resetting",
        countdown: null,
        restartCountdown: null,
        showLotteryResult: false,
        activePrintAttemptId: null,
        nextPrintAttemptId: 4,
      });

      state = experienceReducer(state, { type: "cameraAnimationCompleted" });
      expect(state.phase).toBe("resettingButtonRepositioning");

      state = experienceReducer(state, {
        type: "startButtonAnimationCompleted",
      });
      expect(state.phase).toBe("resettingButtonRevealing");

      state = experienceReducer(state, {
        type: "startButtonAnimationCompleted",
      });
      expect(state.phase).toBe("idle");
    },
  );

  it("ignores events that are invalid for the current phase", () => {
    const idleState = withPhase("idle");
    const invalidActions: ExperienceAction[] = [
      { type: "cameraAnimationCompleted" },
      { type: "promptAnimationCompleted" },
      { type: "promptTextAnimationCompleted" },
      { type: "countdownTicked" },
      { type: "restartCountdownTicked" },
      { type: "lotteryRevealElapsed" },
      { type: "autoResetElapsed" },
      { type: "restartRequested" },
      { type: "photoCaptured", printAttemptId: 1 },
      { type: "printSucceeded", printAttemptId: 1 },
      { type: "printFailed", printAttemptId: 1 },
    ];

    for (const action of invalidActions) {
      expect(experienceReducer(idleState, action)).toBe(idleState);
    }
  });
});
