import type { Transition } from "motion/react";

export const SLIDE_TRANSITION = {
  duration: 0.4,
  ease: "easeOut",
} as const satisfies Transition;

export const PROMPT_TRANSITION = {
  duration: 0.3,
} as const satisfies Transition;

export const PROMPT_TEXT_TRANSITION = {
  duration: 0.2,
} as const satisfies Transition;

export const FLASH_TRANSITION = {
  duration: 0.25,
  ease: "easeOut",
} as const satisfies Transition;

export const COUNTDOWN_TRANSITION = {
  duration: 0.3,
  ease: "easeOut",
} as const satisfies Transition;

/**
 * Wide enough that motion's `onAnimationComplete` still wins the race on a
 * loaded kiosk, so the fallback timers stay pure safety nets.
 */
const ANIMATION_FALLBACK_MARGIN_MS = 500;

export const SLIDE_ANIMATION_FALLBACK_MS =
  SLIDE_TRANSITION.duration * 1000 + ANIMATION_FALLBACK_MARGIN_MS;

export const PROMPT_ANIMATION_FALLBACK_MS =
  PROMPT_TRANSITION.duration * 1000 + ANIMATION_FALLBACK_MARGIN_MS;

/**
 * How long the capture flash stays mounted. Derived from FLASH_TRANSITION so the
 * shutter always lasts exactly one fade, however long the capture itself takes.
 */
export const CAPTURE_FLASH_HOLD_MS = FLASH_TRANSITION.duration * 1000;

/**
 * Slot machine timings, all driven by anime.js rather than motion. The frozen
 * photo shrinks to the left while the slot panel enters from the right, both
 * over the same duration so they read as one cut.
 */
export const SLOT_STAGE_ENTER_MS = 500;

/** Lottery block leaves, claim text arrives, on the same tile. */
export const SLOT_INSTRUCTIONS_SWAP_MS = 420;

/** One icon advance per tick while a reel is looping; stepped, not eased. */
export const REEL_SPIN_TICK_MS = 70;

/** Time for one reel to decelerate onto its final face. */
export const REEL_STOP_DURATION_MS = 900;

/** Delay between consecutive reels stopping. */
export const REEL_STOP_STAGGER_MS = 400;

/** Full strip revolutions a reel travels while decelerating onto its face. */
export const REEL_STOP_EXTRA_CYCLES = 3;

/** Last reel's onComplete is what advances the phase; this is the safety net. */
export const REELS_ANIMATION_FALLBACK_MS =
  REEL_STOP_DURATION_MS +
  2 * REEL_STOP_STAGGER_MS +
  SLOT_STAGE_ENTER_MS +
  ANIMATION_FALLBACK_MARGIN_MS;
