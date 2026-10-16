import type { KioskCommand, KioskReloadMode } from "@dither-booth/shared/kiosk";

import type { ExperiencePhase } from "./Experience.machine";

import { KIOSK_RELOAD_IDLE_TIMEOUT_MS } from "./Experience.constants";

/** What the Experience does for an operator command. */
export type KioskAction = "reload" | "open-darkroom";

export type PendingKioskCommand = {
  commandId: string;
  action: KioskAction;
  mode: KioskReloadMode;
  /** `Date.now()` when the command arrived. */
  requestedAt: number;
};

/**
 * The Experience's action for a command, or undefined when it has nothing to
 * do (it already is the Shutter, or the command is maintenance, which is
 * state and goes through `isMaintenanceShown`). Opening the Darkroom always waits for the
 * landing screen: it would cut a guest's visit off just like a reload.
 */
export const toPendingKioskCommand = (
  command: KioskCommand,
  requestedAt: number,
): PendingKioskCommand | undefined => {
  if (command.type === "reload") {
    return {
      commandId: command.commandId,
      action: "reload",
      mode: command.mode,
      requestedAt,
    };
  }

  if (command.type === "navigate" && command.screen === "darkroom") {
    return {
      commandId: command.commandId,
      action: "open-darkroom",
      mode: "when-idle",
      requestedAt,
    };
  }

  return undefined;
};

/**
 * Whether a pending command runs now. `when-idle` waits for the landing
 * screen so a guest's visit is never cut off, but gives up waiting after
 * `KIOSK_RELOAD_IDLE_TIMEOUT_MS`: a stuck flow never gets back to idle.
 */
export const getKioskCommandTiming = ({
  mode,
  now,
  phase,
  requestedAt,
}: Pick<PendingKioskCommand, "mode" | "requestedAt"> & {
  now: number;
  phase: ExperiencePhase;
}): "run" | "wait" => {
  if (mode === "now" || phase === "idle") return "run";

  return now - requestedAt >= KIOSK_RELOAD_IDLE_TIMEOUT_MS ? "run" : "wait";
};

/** The maintenance switch as the page last heard it. */
export type KioskMaintenance = {
  enabled: boolean;
  /** `Date.now()` when it was switched on, or heard on (re)connecting. */
  requestedAt: number;
};

/**
 * Whether the maintenance screen shows. Switching on waits for the landing
 * screen like any `when-idle` command, then stays on until switched off;
 * switching off hides it straight away.
 */
export const isMaintenanceShown = ({
  isShown,
  maintenance,
  now,
  phase,
}: {
  isShown: boolean;
  maintenance: KioskMaintenance | undefined;
  now: number;
  phase: ExperiencePhase;
}): boolean => {
  if (!maintenance?.enabled) return false;
  if (isShown) return true;

  return (
    getKioskCommandTiming({
      mode: "when-idle",
      now,
      phase,
      requestedAt: maintenance.requestedAt,
    }) === "run"
  );
};
