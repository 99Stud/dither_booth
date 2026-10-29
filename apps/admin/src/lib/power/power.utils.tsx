import type { PowerAction } from "./power.protocol";

import { POWER_BACK_TIMEOUT_MS, POWER_OFF_SILENCE_MS } from "./power.constants";

/*
 * The Power panel's state, browser-side. Once an action is accepted the
 * page can only watch the admin stop and start answering, so the state
 * moves on probe results alone.
 */
export type PowerPhase =
  | { kind: "idle" }
  | { kind: "sending"; action: PowerAction }
  | {
      kind: "waiting";
      action: PowerAction;
      acceptedAt: number;
      /** Seen not answering at least once: the restart has begun. */
      wentDown: boolean;
      /** Since when the admin hasn't answered, for power off. */
      silentSince: number | null;
    }
  | { kind: "back"; action: Exclude<PowerAction, "power-off"> }
  | { kind: "off" }
  /** Not back, or not off, by the timeout. */
  | { kind: "lost"; action: PowerAction }
  | { kind: "failed"; action: PowerAction; message: string };

export type WaitingPowerPhase = Extract<PowerPhase, { kind: "waiting" }>;

export const startWaiting = (
  action: PowerAction,
  acceptedAt: number,
): WaitingPowerPhase => ({
  kind: "waiting",
  action,
  acceptedAt,
  wentDown: false,
  silentSince: null,
});

/** One probe of the admin: did it answer, and when was it asked. */
export function advancePowerPhase(
  phase: WaitingPowerPhase,
  probe: { answered: boolean; at: number },
): PowerPhase {
  const silentSince = probe.answered ? null : (phase.silentSince ?? probe.at);

  if (phase.action === "power-off") {
    if (
      silentSince !== null &&
      probe.at - silentSince >= POWER_OFF_SILENCE_MS
    ) {
      return { kind: "off" };
    }
  } else if (probe.answered && phase.wentDown) {
    return { kind: "back", action: phase.action };
  }

  if (probe.at - phase.acceptedAt >= POWER_BACK_TIMEOUT_MS) {
    return { kind: "lost", action: phase.action };
  }

  return {
    ...phase,
    wentDown: phase.wentDown || !probe.answered,
    silentSince,
  };
}
