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
