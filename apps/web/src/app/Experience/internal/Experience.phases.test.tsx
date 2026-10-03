import { describe, expect, it } from "bun:test";

import type { ExperiencePhase } from "./Experience.machine";
import type { ExperiencePhaseFlag } from "./Experience.phases";

import { PROMPT_TEXT_BY_PHASE } from "./Experience.copy";
import {
  PROMPT_TEXT_TRANSITION,
  PROMPT_TRANSITION,
  SHUTTER_TRANSITION,
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
      "introExiting",
      "cameraEntering",
      "promptEntering",
      "countdown",
      "smile",
      "capturing",
      "preparing",
      "spinning",
      "slotResult",
      "instructions",
      "printing",
    ],
    promptVisible: [
      "promptEntering",
      "countdown",
      "smile",
      "capturing",
      "preparing",
      "spinning",
      "slotResult",
      "instructions",
      "printing",
    ],
    frozenPhoto: [
      "preparing",
      "spinning",
      "slotResult",
      "instructions",
      "printing",
      "cameraExiting",
    ],
    slotVisible: [
      "preparing",
      "spinning",
      "slotResult",
      "instructions",
      "printing",
      "cameraExiting",
    ],
    postPrint: ["receiptReady"],
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
    startButtonVisible: ["idle", "resettingButtonRevealing"],
    startEnabled: ["idle"],
    printAttempt: ["capturing", "preparing", "printing"],
    smileHold: ["smile"],
    slotResultHold: ["slotResult"],
    instructionsHold: ["instructions"],
    reelsAnimationFallback: ["spinning"],
    startButtonAnimationFallback: [
      "resettingButtonRepositioning",
      "resettingButtonRevealing",
    ],
    cameraAnimationFallback: [
      "introExiting",
      "cameraEntering",
      "cameraExiting",
      "resetting",
    ],
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

  // The slot panel and the frozen photo are children of the camera stage, so
  // they can only be on screen while the stage is visible or sliding out.
  it("only shows the slot machine while the camera stage is on screen or exiting", () => {
    for (const phase of ALL_PHASES) {
      if (hasPhaseFlag(phase, "slotVisible")) {
        expect(
          hasPhaseFlag(phase, "cameraVisible") || phase === "cameraExiting",
        ).toBe(true);
        expect(hasPhaseFlag(phase, "frozenPhoto")).toBe(true);
      }
    }
  });
});

describe("AUTO_ADVANCE_ACTION_BY_PHASE", () => {
  it("auto-advances only the receipt-ready phase", () => {
    const autoAdvancingPhases = ALL_PHASES.filter(
      (phase) => AUTO_ADVANCE_ACTION_BY_PHASE[phase] !== null,
    );

    const expectedPhases: ExperiencePhase[] = ["receiptReady"];

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

  // Both fade-out phases are left when the shutter closes. That has to
  // outlast the prompt fade, otherwise resetting the caption on the next phase
  // would be visible mid-fade.
  it("relies on the shutter outlasting the prompt fade", () => {
    expect(PROMPT_TRANSITION.duration).toBeLessThan(SHUTTER_TRANSITION.duration);
  });

  // The outgoing caption has to finish leaving before the prompt itself has
  // faded, otherwise the next line can appear on a caption that should already
  // be gone.
  it("keeps the caption exit inside the prompt fade", () => {
    expect(PROMPT_TEXT_TRANSITION.duration).toBeLessThanOrEqual(
      PROMPT_TRANSITION.duration,
    );
  });
});
