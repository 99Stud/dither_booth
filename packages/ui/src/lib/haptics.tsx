import { WebHaptics } from "web-haptics";

/**
 * The iOS feedback vocabulary: outcomes (success, warning, error), impacts
 * (light, medium, heavy) and selection ticks (segments, detents, pickers).
 */
export type HapticPreset =
  | "success"
  | "warning"
  | "error"
  | "light"
  | "medium"
  | "heavy"
  | "selection";

let haptics: WebHaptics | null = null;

/**
 * Taptic feedback on touch screens in the SaaS theme (admin, the Darkroom).
 * A no-op on desktops and on the kiosk, which is not `html.saas`. iOS only
 * plays it from a user gesture, so call it in the handler of a tap or drag.
 */
export const haptic = (preset: HapticPreset = "medium") => {
  if (typeof window === "undefined") return;
  if (!document.documentElement.classList.contains("saas")) return;
  if (!window.matchMedia("(pointer: coarse)").matches) return;

  try {
    haptics ??= new WebHaptics();
    void Promise.resolve(haptics.trigger(preset)).catch(() => undefined);
  } catch {
    // Feedback is a nicety: never let it break the tap that asked for it.
  }
};
