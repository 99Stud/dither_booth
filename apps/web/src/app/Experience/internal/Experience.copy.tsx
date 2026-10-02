import type { ExperiencePhase } from "./Experience.machine";

const DEFAULT_PROMPT_TEXT = "stay in the frame";

const STRIKE_A_POSE_PROMPT_TEXT = "strike a pose :)";
const LUCKY_PROMPT_TEXT = "feeling lucky?";
const INSTRUCTIONS_PROMPT_TEXT = "that's it";
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
 * `cameraExiting` is reached from `printing`, so the printing caption carries
 * over. `resetting` is reached from any print attempt phase on failure, so its
 * caption can swap mid-fade — on an error path that is already tearing the
 * stage down.
 *
 * Phases after those two are safe to reset because both are left when the
 * shutter closes (SHUTTER_TRANSITION, 620ms), which outlasts the prompt fade
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
  preparing: LUCKY_PROMPT_TEXT,
  spinning: LUCKY_PROMPT_TEXT,
  slotResult: LUCKY_PROMPT_TEXT,
  instructions: INSTRUCTIONS_PROMPT_TEXT,
  printing: PRINTING_PROMPT_TEXT,
  cameraExiting: PRINTING_PROMPT_TEXT,
  resetting: PRINTING_PROMPT_TEXT,
  receiptReady: DEFAULT_PROMPT_TEXT,
  resettingButtonRepositioning: DEFAULT_PROMPT_TEXT,
  resettingButtonRevealing: DEFAULT_PROMPT_TEXT,
};
