import type { WebcamHandle } from "@dither-booth/ui/components/misc/Webcam";

import { logKioskEvent } from "@dither-booth/logging";
import { DARKROOM_PATH } from "@dither-booth/shared/darkroom";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type RefObject, useEffect, useState } from "react";

import { SHUTTER_KIOSK_LOG_SOURCE } from "#lib/constants";
import { useKioskCommandStream } from "#lib/kiosk/useKioskCommandStream";
import { useTRPC } from "#lib/trpc/trpc.client";

import type { ExperiencePhase } from "../Experience.machine";

import { KIOSK_RELOAD_IDLE_TIMEOUT_MS } from "../Experience.constants";
import {
  getKioskCommandTiming,
  isMaintenanceShown,
  type KioskMaintenance,
  type PendingKioskCommand,
  toPendingKioskCommand,
} from "../Experience.kiosk";
import { useCameraPreview } from "./useCameraPreview";

/**
 * Listens on the kiosk channel and runs the operator's commands (reload,
 * open the Darkroom) once the guest's visit allows it. Returns whether the
 * maintenance screen shows.
 */
export const useKioskCommands = (
  phase: ExperiencePhase,
  webcamRef: RefObject<WebcamHandle | null>,
) => {
  const navigate = useNavigate();
  const [pending, setPending] = useState<PendingKioskCommand>();
  const [maintenance, setMaintenance] = useState<KioskMaintenance>();
  const [isMaintenance, setIsMaintenance] = useState(false);
  const handleCameraCommand = useCameraPreview(webcamRef);
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  useKioskCommandStream("shutter", isMaintenance, (command) => {
    if (command.type === "maintenance") {
      // Every (re)connection restates it: keep the first request's time so
      // the wait for the guest doesn't start over.
      setMaintenance((current) =>
        current?.enabled === command.enabled
          ? current
          : { enabled: command.enabled, requestedAt: Date.now() },
      );
      return;
    }

    if (command.type === "camera") {
      handleCameraCommand(command);
      return;
    }

    // New copy can show mid-visit: it changes words, never the flow.
    if (command.type === "kit-updated") {
      void queryClient.invalidateQueries({
        queryKey: trpc.booth.getKit.queryKey(),
      });
      return;
    }

    // Safe mid-visit too: the visit keeps the lottery state it started with,
    // only the landing screen follows the new one.
    if (command.type === "lottery-updated") {
      void queryClient.invalidateQueries({
        queryKey: trpc.booth.getLotteryStatus.queryKey(),
      });
      return;
    }

    const next = toPendingKioskCommand(command, Date.now());
    if (next) setPending(next);
  });

  useEffect(() => {
    const isDue = () =>
      isMaintenanceShown({
        isShown: isMaintenance,
        maintenance,
        now: Date.now(),
        phase,
      });

    if (isDue() !== isMaintenance) {
      logKioskEvent(
        "info",
        SHUTTER_KIOSK_LOG_SOURCE,
        isMaintenance ? "kiosk-maintenance-hidden" : "kiosk-maintenance-shown",
        { details: { phase } },
      );
      setIsMaintenance(!isMaintenance);
      return;
    }

    if (isMaintenance || !maintenance?.enabled) return;

    // Waiting for the guest: re-checked on every phase change by this
    // effect; the timer covers a flow that never gets back to idle.
    const timeoutId = window.setTimeout(
      () => {
        if (isDue()) setIsMaintenance(true);
      },
      Math.max(
        0,
        maintenance.requestedAt + KIOSK_RELOAD_IDLE_TIMEOUT_MS - Date.now(),
      ),
    );

    return () => window.clearTimeout(timeoutId);
  }, [isMaintenance, maintenance, phase]);

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

  return isMaintenance;
};
