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
  | "postPrint"
  | "postPrintEntersInPlace"
  | "introDecorations"
  | "startButtonAtOrigin"
  | "startButtonVisible"
  | "startEnabled"
  | "printAttempt"
  | "smileHold"
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
  printing: ["cameraVisible", "promptVisible", "printAttempt"],
  cameraExiting: ["cameraAnimationFallback"],
  receiptReady: ["postPrint"],
  cashMachine: ["postPrint"],
  // Enters in place because the post-print AnimatePresence runs in `wait` mode:
  // cashMachine has already slid out to the left by the time this mounts, so
  // sliding in from the right would reverse the direction of travel mid-screen.
  lotteryResults: ["postPrint", "postPrintEntersInPlace"],
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
  printing: null,
  cameraExiting: null,
  receiptReady: { type: "autoResetElapsed" },
  cashMachine: { type: "cashMachineElapsed" },
  lotteryResults: { type: "autoResetElapsed" },
  resetting: null,
  resettingButtonRepositioning: null,
  resettingButtonRevealing: null,
};
