import type { ExperienceAction, ExperiencePhase } from "./Experience.machine";

/**
 * Every phase-keyed behavior the view layer and the fallback timers read.
 *
 * Flags rather than one Set per concern: PHASE_FLAGS is typed as an exhaustive
 * `Record<ExperiencePhase, ...>`, so adding a phase to the machine is a compile
 * error until its behavior is decided here. A collection of Sets cannot express
 * that — an unlisted phase silently means "hidden everywhere".
 */
export type ExperiencePhaseFlag =
  | "cameraVisible"
  | "promptVisible"
  | "frozenPhoto"
  | "slotVisible"
  | "postPrint"
  | "introDecorations"
  | "startButtonAtOrigin"
  | "startButtonVisible"
  | "startEnabled"
  | "printAttempt"
  | "smileHold"
  | "slotResultHold"
  | "instructionsHold"
  | "reelsAnimationFallback"
  | "startButtonAnimationFallback"
  | "cameraAnimationFallback"
  | "promptAnimationFallback";

export const PHASE_FLAGS: Record<
  ExperiencePhase,
  readonly ExperiencePhaseFlag[]
> = {
  idle: [
    "introDecorations",
    "startButtonAtOrigin",
    "startButtonVisible",
    "startEnabled",
  ],
  introExiting: ["startButtonVisible", "startButtonAnimationFallback"],
  cameraEntering: ["cameraVisible", "cameraAnimationFallback"],
  promptEntering: ["cameraVisible", "promptVisible", "promptAnimationFallback"],
  countdown: ["cameraVisible", "promptVisible"],
  smile: ["cameraVisible", "promptVisible", "smileHold"],
  capturing: ["cameraVisible", "promptVisible", "printAttempt"],
  preparing: [
    "cameraVisible",
    "promptVisible",
    "frozenPhoto",
    "slotVisible",
    "printAttempt",
  ],
  spinning: [
    "cameraVisible",
    "promptVisible",
    "frozenPhoto",
    "slotVisible",
    "reelsAnimationFallback",
  ],
  slotResult: [
    "cameraVisible",
    "promptVisible",
    "frozenPhoto",
    "slotVisible",
    "slotResultHold",
  ],
  instructions: [
    "cameraVisible",
    "promptVisible",
    "frozenPhoto",
    "slotVisible",
    "instructionsHold",
  ],
  printing: [
    "cameraVisible",
    "promptVisible",
    "frozenPhoto",
    "slotVisible",
    "printAttempt",
  ],
  // The frozen photo and the slot panel ride out with the camera stage, so
  // they stay mounted until the slide completes.
  cameraExiting: ["frozenPhoto", "slotVisible", "cameraAnimationFallback"],
  receiptReady: ["postPrint"],
  resetting: ["introDecorations", "cameraAnimationFallback"],
  resettingButtonRepositioning: [
    "introDecorations",
    "startButtonAtOrigin",
    "startButtonAnimationFallback",
  ],
  resettingButtonRevealing: [
    "introDecorations",
    "startButtonAtOrigin",
    "startButtonVisible",
    "startButtonAnimationFallback",
  ],
};

export const hasPhaseFlag = (
  phase: ExperiencePhase,
  flag: ExperiencePhaseFlag,
) => PHASE_FLAGS[phase].includes(flag);

/**
 * Phases that walk themselves forward after PHASE_AUTO_ADVANCE_MS. Exhaustive
 * for the same reason as PHASE_FLAGS: a new phase has to say `null` out loud.
 */
export const AUTO_ADVANCE_ACTION_BY_PHASE: Record<
  ExperiencePhase,
  ExperienceAction | null
> = {
  idle: null,
  introExiting: null,
  cameraEntering: null,
  promptEntering: null,
  countdown: null,
  smile: null,
  capturing: null,
  preparing: null,
  spinning: null,
  slotResult: null,
  instructions: null,
  printing: null,
  cameraExiting: null,
  receiptReady: { type: "autoResetElapsed" },
  resetting: null,
  resettingButtonRepositioning: null,
  resettingButtonRevealing: null,
};
