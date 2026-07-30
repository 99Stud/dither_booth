import { describe, expect, it } from "bun:test";

import { COUNTDOWN_START } from "./Experience.constants";
import {
  experienceReducer,
  initialExperienceState,
  type ExperienceAction,
  type ExperienceState,
} from "./Experience.machine";

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
    { type: "smileElapsed" },
  );

  expect(state.phase).toBe("capturing");
  return state;
};

describe("experienceReducer", () => {
  it("runs the complete successful experience flow through lottery results", () => {
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
      type: "smileElapsed",
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
      phase: "cameraExiting",
      activePrintAttemptId: null,
    });

    state = experienceReducer(state, { type: "cameraAnimationCompleted" });
    expect(state).toMatchObject({
      phase: "receiptReady",
      activePrintAttemptId: null,
    });

    state = experienceReducer(state, { type: "playLotteryRequested" });
    expect(state.phase).toBe("cashMachine");

    state = experienceReducer(state, { type: "cashMachineElapsed" });
    expect(state.phase).toBe("lotteryResults");

    state = experienceReducer(state, { type: "autoResetElapsed" });
    expect(state.phase).toBe("resettingButtonRepositioning");
  });

  it("starts only one print attempt for duplicate smile elapsed events", () => {
    const capturingState = enterCapturing();
    const duplicateState = experienceReducer(capturingState, {
      type: "smileElapsed",
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

  it("auto-resets from receiptReady without playing the lottery", () => {
    const successState = withPhase("receiptReady", {
      countdown: 2,
      activePrintAttemptId: 3,
      nextPrintAttemptId: 4,
    });

    let state = experienceReducer(successState, { type: "autoResetElapsed" });
    expect(state).toMatchObject({
      phase: "resettingButtonRepositioning",
      countdown: null,
      activePrintAttemptId: null,
      nextPrintAttemptId: 4,
    });

    state = experienceReducer(state, {
      type: "startButtonAnimationCompleted",
    });
    expect(state.phase).toBe("resettingButtonRevealing");

    state = experienceReducer(state, {
      type: "startButtonAnimationCompleted",
    });
    expect(state.phase).toBe("idle");
  });

  it("runs the complete reset animation chain from lotteryResults", () => {
    const lotteryState = withPhase("lotteryResults", {
      countdown: 2,
      activePrintAttemptId: 3,
      nextPrintAttemptId: 4,
    });

    let state = experienceReducer(lotteryState, { type: "autoResetElapsed" });
    expect(state).toMatchObject({
      phase: "resettingButtonRepositioning",
      countdown: null,
      activePrintAttemptId: null,
      nextPrintAttemptId: 4,
    });

    state = experienceReducer(state, {
      type: "startButtonAnimationCompleted",
    });
    expect(state.phase).toBe("resettingButtonRevealing");

    state = experienceReducer(state, {
      type: "startButtonAnimationCompleted",
    });
    expect(state.phase).toBe("idle");
  });

  it("ignores events that are invalid for the current phase", () => {
    const idleState = withPhase("idle");
    const invalidActions: ExperienceAction[] = [
      { type: "cameraAnimationCompleted" },
      { type: "promptAnimationCompleted" },
      { type: "smileElapsed" },
      { type: "countdownTicked" },
      { type: "playLotteryRequested" },
      { type: "cashMachineElapsed" },
      { type: "autoResetElapsed" },
      { type: "photoCaptured", printAttemptId: 1 },
      { type: "printSucceeded", printAttemptId: 1 },
      { type: "printFailed", printAttemptId: 1 },
    ];

    for (const action of invalidActions) {
      expect(experienceReducer(idleState, action)).toBe(idleState);
    }
  });

  it("treats duplicate animation-complete events as no-ops after transition", () => {
    const afterStartButton = experienceReducer(withPhase("introExiting"), {
      type: "startButtonAnimationCompleted",
    });
    expect(afterStartButton.phase).toBe("cameraEntering");
    expect(
      experienceReducer(afterStartButton, {
        type: "startButtonAnimationCompleted",
      }),
    ).toBe(afterStartButton);

    const afterCamera = experienceReducer(afterStartButton, {
      type: "cameraAnimationCompleted",
    });
    expect(afterCamera.phase).toBe("promptEntering");
    expect(
      experienceReducer(afterCamera, { type: "cameraAnimationCompleted" }),
    ).toBe(afterCamera);

    const afterPrompt = experienceReducer(afterCamera, {
      type: "promptAnimationCompleted",
    });
    expect(afterPrompt).toMatchObject({
      phase: "countdown",
      countdown: COUNTDOWN_START,
    });
    expect(
      experienceReducer(afterPrompt, { type: "promptAnimationCompleted" }),
    ).toBe(afterPrompt);
  });
});
