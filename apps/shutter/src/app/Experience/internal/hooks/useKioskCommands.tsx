import { logKioskEvent } from "@dither-booth/logging";
import { DARKROOM_PATH } from "@dither-booth/shared/darkroom";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { SHUTTER_KIOSK_LOG_SOURCE } from "#lib/constants";
import { useKioskCommandStream } from "#lib/kiosk/useKioskCommandStream";

import type { ExperiencePhase } from "../Experience.machine";

import { KIOSK_RELOAD_IDLE_TIMEOUT_MS } from "../Experience.constants";
import {
  getKioskCommandTiming,
  type PendingKioskCommand,
  toPendingKioskCommand,
} from "../Experience.kiosk";

/**
 * Listens on the kiosk channel and runs the operator's commands (reload,
 * open the Darkroom) once the guest's visit allows it.
 */
export const useKioskCommands = (phase: ExperiencePhase) => {
  const navigate = useNavigate();
  const [pending, setPending] = useState<PendingKioskCommand>();

  useKioskCommandStream("shutter", (command) => {
    const next = toPendingKioskCommand(command, Date.now());
    if (next) setPending(next);
  });

  useEffect(() => {
    if (!pending) return;

    const runIfDue = () => {
      const timing = getKioskCommandTiming({
        ...pending,
        now: Date.now(),
        phase,
      });

      if (timing !== "run") return false;

      const details = {
        commandId: pending.commandId,
        mode: pending.mode,
        phase,
      };

      if (pending.action === "reload") {
        logKioskEvent("info", SHUTTER_KIOSK_LOG_SOURCE, "kiosk-reload", {
          details,
        });
        window.location.reload();
      } else {
        logKioskEvent(
          "info",
          SHUTTER_KIOSK_LOG_SOURCE,
          "kiosk-darkroom-opened",
          { details },
        );
        setPending(undefined);
        void navigate({ to: DARKROOM_PATH });
      }
      return true;
    };

    if (runIfDue()) return;

    // Re-checked on every phase change by this effect; the timer covers a
    // flow that never gets back to idle.
    const timeoutId = window.setTimeout(
      runIfDue,
      Math.max(
        0,
        pending.requestedAt + KIOSK_RELOAD_IDLE_TIMEOUT_MS - Date.now(),
      ),
    );

    return () => window.clearTimeout(timeoutId);
  }, [navigate, pending, phase]);
};
