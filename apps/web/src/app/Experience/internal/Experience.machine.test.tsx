import type { DrawResult } from "@dither-booth/shared/lottery";

import { describe, expect, it } from "bun:test";

import { COUNTDOWN_START } from "./Experience.constants";
import {
  experienceReducer,
  initialExperienceState,
  type ExperienceAction,
  type ExperienceState,
} from "./Experience.machine";

const LOSS_DRAW: DrawResult = { outcome: "loss", prize: null };
const WIN_DRAW: DrawResult = {
  outcome: "win",
  prize: {
    id: "prize-1",
    rarity: "legendary",
    title: "a free drink",
    winInstruction: "Show this ticket at the bar",
  },
};
const PHOTO_URL = "blob:kiosk/photo-1";
const TICKET_REF = "123456";

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

const enterPrinting = (drawResult: DrawResult = WIN_DRAW): ExperienceState => {
  const state = reduce(
    enterCapturing(),
    { type: "photoCaptured", printAttemptId: 1, photoUrl: PHOTO_URL },
    {
      type: "receiptPrepared",
      printAttemptId: 1,
      drawResult,
      ticketRef: TICKET_REF,
    },
    { type: "reelsStopped" },
    { type: "slotResultElapsed" },
    { type: "instructionsElapsed" },
  );

  expect(state.phase).toBe("printing");
  return state;
};

describe("experienceReducer", () => {
  it("runs the complete successful experience flow through the slot machine", () => {
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

    state = experienceReducer(state, { type: "smileElapsed" });
    expect(state).toMatchObject({
      phase: "capturing",
      activePrintAttemptId: 1,
      nextPrintAttemptId: 2,
    });

    state = experienceReducer(state, {
      type: "photoCaptured",
      printAttemptId: 1,
      photoUrl: PHOTO_URL,
    });
    expect(state).toMatchObject({ phase: "preparing", photoUrl: PHOTO_URL });

    state = experienceReducer(state, {
      type: "receiptPrepared",
      printAttemptId: 1,
      drawResult: WIN_DRAW,
      ticketRef: TICKET_REF,
    });
    expect(state).toMatchObject({
      phase: "spinning",
      drawResult: WIN_DRAW,
      ticketRef: TICKET_REF,
      activePrintAttemptId: 1,
    });

    state = experienceReducer(state, { type: "reelsStopped" });
    expect(state.phase).toBe("slotResult");

    state = experienceReducer(state, { type: "slotResultElapsed" });
    expect(state).toMatchObject({
      phase: "instructions",
      activePrintAttemptId: 1,
    });

    state = experienceReducer(state, { type: "instructionsElapsed" });
    expect(state).toMatchObject({ phase: "printing", activePrintAttemptId: 1 });

    state = experienceReducer(state, {
      type: "printSucceeded",
      printAttemptId: 1,
    });
    expect(state).toMatchObject({
      phase: "cameraExiting",
      activePrintAttemptId: null,
      ticketRef: null,
      drawResult: WIN_DRAW,
      photoUrl: PHOTO_URL,
    });

    state = experienceReducer(state, { type: "cameraAnimationCompleted" });
    expect(state).toMatchObject({
      phase: "receiptReady",
      drawResult: WIN_DRAW,
    });

    state = experienceReducer(state, { type: "autoResetElapsed" });
    expect(state).toMatchObject({
      phase: "resettingButtonRepositioning",
      drawResult: null,
      photoUrl: null,
    });
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
        photoUrl: PHOTO_URL,
      }),
    ).toBe(capturingState);
    expect(
      experienceReducer(capturingState, {
        type: "printFailed",
        printAttemptId: 999,
      }),
    ).toBe(capturingState);

    const preparingState = experienceReducer(capturingState, {
      type: "photoCaptured",
      printAttemptId: 1,
      photoUrl: PHOTO_URL,
    });

    expect(
      experienceReducer(preparingState, {
        type: "receiptPrepared",
        printAttemptId: 999,
        drawResult: LOSS_DRAW,
        ticketRef: TICKET_REF,
      }),
    ).toBe(preparingState);

    const printingState = enterPrinting();

    expect(
      experienceReducer(printingState, {
        type: "printSucceeded",
        printAttemptId: 999,
      }),
    ).toBe(printingState);
  });

  it("keeps the slot machine phases in order", () => {
    const preparingState = experienceReducer(enterCapturing(), {
      type: "photoCaptured",
      printAttemptId: 1,
      photoUrl: PHOTO_URL,
    });

    // Reels cannot stop before the draw is known.
    expect(experienceReducer(preparingState, { type: "reelsStopped" })).toBe(
      preparingState,
    );
    expect(
      experienceReducer(preparingState, { type: "slotResultElapsed" }),
    ).toBe(preparingState);

    const spinningState = experienceReducer(preparingState, {
      type: "receiptPrepared",
      printAttemptId: 1,
      drawResult: LOSS_DRAW,
      ticketRef: TICKET_REF,
    });

    expect(
      experienceReducer(spinningState, { type: "slotResultElapsed" }),
    ).toBe(spinningState);
    expect(
      experienceReducer(spinningState, { type: "instructionsElapsed" }),
    ).toBe(spinningState);
    expect(
      experienceReducer(spinningState, {
        type: "printSucceeded",
        printAttemptId: 1,
      }),
    ).toBe(spinningState);

    const slotResultState = experienceReducer(spinningState, {
      type: "reelsStopped",
    });
    const instructionsState = experienceReducer(slotResultState, {
      type: "slotResultElapsed",
    });

    expect(instructionsState.phase).toBe("instructions");
    expect(
      experienceReducer(instructionsState, {
        type: "printSucceeded",
        printAttemptId: 1,
      }),
    ).toBe(instructionsState);
  });

  it("resets atomically after a failure at any print attempt phase", () => {
    const capturingState = enterCapturing();
    const preparingState = experienceReducer(capturingState, {
      type: "photoCaptured",
      printAttemptId: 1,
      photoUrl: PHOTO_URL,
    });
    const spinningState = experienceReducer(preparingState, {
      type: "receiptPrepared",
      printAttemptId: 1,
      drawResult: WIN_DRAW,
      ticketRef: TICKET_REF,
    });
    const slotResultState = experienceReducer(spinningState, {
      type: "reelsStopped",
    });
    const instructionsState = experienceReducer(slotResultState, {
      type: "slotResultElapsed",
    });
    const printingState = experienceReducer(instructionsState, {
      type: "instructionsElapsed",
    });

    for (const state of [
      capturingState,
      preparingState,
      spinningState,
      slotResultState,
      instructionsState,
      printingState,
    ]) {
      expect(
        experienceReducer(state, { type: "printFailed", printAttemptId: 1 }),
      ).toMatchObject({
        phase: "resetting",
        countdown: null,
        drawResult: null,
        photoUrl: null,
        ticketRef: null,
        activePrintAttemptId: null,
        nextPrintAttemptId: 2,
      });
    }
  });

  it("auto-resets from receiptReady through the button animation chain", () => {
    const successState = withPhase("receiptReady", {
      countdown: 2,
      drawResult: WIN_DRAW,
      photoUrl: PHOTO_URL,
      activePrintAttemptId: 3,
      nextPrintAttemptId: 4,
    });

    let state = experienceReducer(successState, { type: "autoResetElapsed" });
    expect(state).toMatchObject({
      phase: "resettingButtonRepositioning",
      countdown: null,
      drawResult: null,
      photoUrl: null,
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
      { type: "reelsStopped" },
      { type: "slotResultElapsed" },
      { type: "instructionsElapsed" },
      { type: "autoResetElapsed" },
      { type: "photoCaptured", printAttemptId: 1, photoUrl: PHOTO_URL },
      {
        type: "receiptPrepared",
        printAttemptId: 1,
        drawResult: LOSS_DRAW,
        ticketRef: TICKET_REF,
      },
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
