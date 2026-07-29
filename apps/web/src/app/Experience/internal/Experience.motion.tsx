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
