import { describe, expect, it } from "bun:test";

import type { ExperiencePhase } from "./Experience.machine";
import type { ExperiencePhaseFlag } from "./Experience.phases";

import { PROMPT_TEXT_BY_PHASE } from "./Experience.copy";
import {
  PROMPT_PANEL_LAYOUT_TRANSITION,
  PROMPT_TEXT_TRANSITION,
  PROMPT_TRANSITION,
  SLIDE_TRANSITION,
} from "./Experience.motion";
import {
  AUTO_ADVANCE_ACTION_BY_PHASE,
  PHASE_FLAGS,
  hasPhaseFlag,
} from "./Experience.phases";

const ALL_PHASES = Object.keys(PHASE_FLAGS) as ExperiencePhase[];

/**
 * Transcribed from the per-concern phase Sets that PHASE_FLAGS replaced, so a
 * typo in the table shows up as a behavior change rather than a silent one.
 */
const EXPECTED_PHASES_BY_FLAG: Record<ExperiencePhaseFlag, ExperiencePhase[]> =
  {
    cameraVisible: [
      "cameraEntering",
      "promptEntering",
      "countdown",
      "smile",
      "capturing",
      "printing",
    ],
    promptVisible: [
      "promptEntering",
      "countdown",
      "smile",
      "capturing",
      "printing",
    ],
    postPrint: ["receiptReady", "cashMachine", "lotteryResults"],
    postPrintEntersInPlace: ["lotteryResults"],
    introDecorations: [
      "idle",
      "resetting",
      "resettingButtonRepositioning",
      "resettingButtonRevealing",
    ],
    startButtonAtOrigin: [
      "idle",
      "resettingButtonRepositioning",
      "resettingButtonRevealing",
    ],
    startButtonVisible: ["idle", "introExiting", "resettingButtonRevealing"],
    startEnabled: ["idle"],
    printAttempt: ["capturing", "printing"],
    smileHold: ["smile"],
    startButtonAnimationFallback: [
      "introExiting",
      "resettingButtonRepositioning",
      "resettingButtonRevealing",
    ],
    cameraAnimationFallback: ["cameraEntering", "cameraExiting", "resetting"],
    promptAnimationFallback: ["promptEntering"],
  };

describe("PHASE_FLAGS", () => {
  it("grants each flag to exactly the phases that owned it before", () => {
    for (const [flag, expectedPhases] of Object.entries(
      EXPECTED_PHASES_BY_FLAG,
    ) as [ExperiencePhaseFlag, ExperiencePhase[]][]) {
      const actualPhases = ALL_PHASES.filter((phase) =>
        hasPhaseFlag(phase, flag),
      );

      expect(actualPhases.toSorted()).toEqual(expectedPhases.toSorted());
    }
  });

  it("never marks a phase as entering in place without being a post-print phase", () => {
    for (const phase of ALL_PHASES) {
      if (hasPhaseFlag(phase, "postPrintEntersInPlace")) {
        expect(hasPhaseFlag(phase, "postPrint")).toBe(true);
      }
    }
  });
});

describe("AUTO_ADVANCE_ACTION_BY_PHASE", () => {
  it("auto-advances only the three post-print phases", () => {
    const autoAdvancingPhases = ALL_PHASES.filter(
      (phase) => AUTO_ADVANCE_ACTION_BY_PHASE[phase] !== null,
    );

    const expectedPhases: ExperiencePhase[] = [
      "cashMachine",
      "lotteryResults",
      "receiptReady",
    ];

    expect(autoAdvancingPhases.toSorted()).toEqual(expectedPhases.toSorted());
  });
});

describe("PROMPT_TEXT_BY_PHASE", () => {
  // The caption is a pure derivation of the phase, so the phases where the
  // prompt panel is still fading out have to repeat the text it faded out with.
  it("holds the printing caption through the phases that fade the panel out", () => {
    expect(PROMPT_TEXT_BY_PHASE.cameraExiting).toBe(
      PROMPT_TEXT_BY_PHASE.printing,
    );
    expect(PROMPT_TEXT_BY_PHASE.resetting).toBe(PROMPT_TEXT_BY_PHASE.printing);
  });

  // Both fade-out phases are left when the camera slide completes. That has to
  // outlast the prompt fade, otherwise resetting the caption on the next phase
  // would be visible mid-fade.
  it("relies on the camera slide outlasting the prompt fade", () => {
    expect(PROMPT_TRANSITION.duration).toBeLessThan(SLIDE_TRANSITION.duration);
  });

  // `mode="wait"` sequences the caption swap: the outgoing caption exits, then
  // the incoming one mounts and the panel resizes. Comparing either half to the
  // fade on its own would miss the case where they add up past it and leave a
  // width change running on a panel the user is no longer meant to see. The
  // incoming caption's fade runs after the resize and is intentionally not
  // covered — it is free to finish on an already invisible panel.
  it("keeps the caption swap's panel resize inside the prompt fade", () => {
    expect(
      PROMPT_TEXT_TRANSITION.duration + PROMPT_PANEL_LAYOUT_TRANSITION.duration,
    ).toBeLessThanOrEqual(PROMPT_TRANSITION.duration);
  });
});
