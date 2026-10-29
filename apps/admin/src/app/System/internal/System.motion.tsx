/*
 * The System page's motion, all of it: values tween instead of jumping,
 * the panels settle in once, a status that worsens pulses once. Nothing
 * loops, and every number here is the only place it is written.
 */

export const SYSTEM_VALUE_TWEEN_MS = 600;
export const SYSTEM_VALUE_TWEEN_EASE = "outQuad";

export const SYSTEM_PANEL_ENTRANCE_MS = 450;
export const SYSTEM_PANEL_ENTRANCE_EASE = "outCubic";
export const SYSTEM_PANEL_STAGGER_MS = 60;
export const SYSTEM_PANEL_RISE_PX = 8;
/** Marks a panel the entrance animates. */
export const SYSTEM_PANEL_ATTRIBUTE = "data-system-panel";

export const SYSTEM_STATUS_PULSE_MS = 500;
export const SYSTEM_STATUS_PULSE_EASE = "inOutSine";
export const SYSTEM_STATUS_PULSE_SCALE = 1.4;

/*
 * The Software panel. An update's steps arrive one by one, so each one
 * that ends is marked once: its check pops in, the next step slides into
 * place. The result's mark draws itself once. Still nothing loops: the
 * running step's spinner is the only motion that lasts.
 */
export const UPDATE_STEP_POP_MS = 380;
export const UPDATE_STEP_POP_EASE = "outBack(2)";
export const UPDATE_STEP_POP_FROM_SCALE = 0.4;
export const UPDATE_STEP_SLIDE_PX = 6;
export const UPDATE_STEPS_STAGGER_MS = 35;
export const UPDATE_RESULT_DRAW_MS = 700;
export const UPDATE_RESULT_DRAW_EASE = "inOutQuad";
/** Marks a step row, and the icon in it that pops. */
export const UPDATE_STEP_ATTRIBUTE = "data-update-step";
export const UPDATE_STEP_ICON_ATTRIBUTE = "data-update-step-icon";
