import type { ExperiencePhase } from "./Experience.machine";

const DEFAULT_PROMPT_TEXT = "stay in the frame";

const STRIKE_A_POSE_PROMPT_TEXT = "strike a pose :)";
const PRINTING_PROMPT_TEXT = "printing...";

/**
 * Exhaustive so the caption is a pure derivation of the phase — no latching in
 * the consumer.
 *
 * The entries that matter are the ones where the prompt panel is no longer
 * visible but is still fading out: `cameraExiting` and `resetting` have to keep
 * showing the printing caption, otherwise the user reads the next phase's text
 * mid-fade.
 *
 * Both are reached from `printing`, so the printing caption carries over. The
 * one exception is a capture that fails before it resolves — `capturing` reaches
 * `resetting` directly and the caption does swap mid-fade, on an error path that
 * is already tearing the stage down.
 *
 * Phases after those two are safe to reset because both are left when the camera
 * slide completes (SLIDE_TRANSITION, 400ms), which outlasts the prompt fade
 * (PROMPT_TRANSITION, 300ms) — the panel is fully transparent by then. That
 * ordering is asserted in Experience.phases.test.tsx.
 */
export const PROMPT_TEXT_BY_PHASE: Record<ExperiencePhase, string> = {
  idle: DEFAULT_PROMPT_TEXT,
  introExiting: DEFAULT_PROMPT_TEXT,
  cameraEntering: DEFAULT_PROMPT_TEXT,
  promptEntering: DEFAULT_PROMPT_TEXT,
  countdown: DEFAULT_PROMPT_TEXT,
  smile: STRIKE_A_POSE_PROMPT_TEXT,
  capturing: STRIKE_A_POSE_PROMPT_TEXT,
  printing: PRINTING_PROMPT_TEXT,
  cameraExiting: PRINTING_PROMPT_TEXT,
  resetting: PRINTING_PROMPT_TEXT,
  receiptReady: DEFAULT_PROMPT_TEXT,
  cashMachine: DEFAULT_PROMPT_TEXT,
  lotteryResults: DEFAULT_PROMPT_TEXT,
  resettingButtonRepositioning: DEFAULT_PROMPT_TEXT,
  resettingButtonRevealing: DEFAULT_PROMPT_TEXT,
};
