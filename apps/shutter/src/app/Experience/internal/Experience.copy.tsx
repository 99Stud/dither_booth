import type { CopyKey } from "@dither-booth/shared/kit-copy";

import type { ExperiencePhase } from "./Experience.machine";

export type { PromptKey };

/** The visit's captions, each one a kit text the event can edit. */
type PromptKey = Extract<CopyKey, `prompts.${string}`>;

const DEFAULT_PROMPT = "prompts.stayInFrame" satisfies PromptKey;
const STRIKE_A_POSE_PROMPT = "prompts.strikePose" satisfies PromptKey;
const LUCKY_PROMPT = "prompts.feelingLucky" satisfies PromptKey;
const INSTRUCTIONS_PROMPT = "prompts.thatsIt" satisfies PromptKey;
const PRINTING_PROMPT = "prompts.printing" satisfies PromptKey;

const LIVE_SQUARE_PROMPTS = new Set<PromptKey>([
  DEFAULT_PROMPT,
  STRIKE_A_POSE_PROMPT,
]);

/**
 * Captions that sit inside the square. With a lottery, later lines stay above
 * the stage, over the photo and slot pair; without one the photo keeps the
 * square, so every caption stays in it. Decided by which caption it is, never
 * its text, which the event can edit.
 */
export const isPromptInSquare = (prompt: PromptKey, hasLottery: boolean) =>
  !hasLottery || LIVE_SQUARE_PROMPTS.has(prompt);

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
export const PROMPT_BY_PHASE: Record<ExperiencePhase, PromptKey> = {
  idle: DEFAULT_PROMPT,
  introExiting: DEFAULT_PROMPT,
  countdown: DEFAULT_PROMPT,
  smile: STRIKE_A_POSE_PROMPT,
  capturing: STRIKE_A_POSE_PROMPT,
  preparing: LUCKY_PROMPT,
  spinning: LUCKY_PROMPT,
  slotResult: LUCKY_PROMPT,
  instructions: INSTRUCTIONS_PROMPT,
  printing: PRINTING_PROMPT,
  cameraExiting: PRINTING_PROMPT,
  resetting: PRINTING_PROMPT,
  receiptReady: DEFAULT_PROMPT,
  resettingButtonRepositioning: DEFAULT_PROMPT,
  resettingButtonRevealing: DEFAULT_PROMPT,
};

/** Captions that talk about the draw, so a visit without a lottery skips them. */
const LOTTERY_PROMPTS = new Set<PromptKey>([LUCKY_PROMPT, INSTRUCTIONS_PROMPT]);

/**
 * The caption for a phase. Without a lottery the only draw phase the visit
 * passes through is `preparing`, where the receipt is already on its way, so it
 * reads as printing.
 */
export const getPrompt = (
  phase: ExperiencePhase,
  hasLottery: boolean,
): PromptKey => {
  const prompt = PROMPT_BY_PHASE[phase];

  return !hasLottery && LOTTERY_PROMPTS.has(prompt) ? PRINTING_PROMPT : prompt;
};
