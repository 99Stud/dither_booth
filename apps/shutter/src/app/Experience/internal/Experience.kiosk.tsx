import type { KioskReloadMode } from "@dither-booth/shared/kiosk";

import type { ExperiencePhase } from "./Experience.machine";

import { KIOSK_RELOAD_IDLE_TIMEOUT_MS } from "./Experience.constants";

export type PendingKioskReload = {
  commandId: string;
  mode: KioskReloadMode;
  /** `Date.now()` when the command arrived. */
  requestedAt: number;
};

/**
 * Whether a requested reload runs now. `when-idle` waits for the landing
 * screen so a guest's visit is never cut off, but gives up waiting after
 * `KIOSK_RELOAD_IDLE_TIMEOUT_MS`: a stuck flow never gets back to idle.
 */
export const getKioskReloadAction = ({
  mode,
  now,
  phase,
  requestedAt,
}: Pick<PendingKioskReload, "mode" | "requestedAt"> & {
  now: number;
  phase: ExperiencePhase;
}): "reload" | "wait" => {
  if (mode === "now" || phase === "idle") return "reload";

  return now - requestedAt >= KIOSK_RELOAD_IDLE_TIMEOUT_MS ? "reload" : "wait";
};
