import { logKioskEvent } from "@dither-booth/logging";
import { initializeBrowserLogging } from "@dither-booth/logging/browser";
import { createDeviceId } from "@dither-booth/shared/id";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useEffect, useState } from "react";

import { SHUTTER_KIOSK_LOG_SOURCE } from "#lib/constants";
import { useTRPC } from "#lib/trpc/trpc.client";

import type { ExperiencePhase } from "../Experience.machine";

import { KIOSK_RELOAD_IDLE_TIMEOUT_MS } from "../Experience.constants";
import {
  getKioskReloadAction,
  type PendingKioskReload,
} from "../Experience.kiosk";

/**
 * Listens on the kiosk channel and runs the operator's commands. Only the
 * Experience route calls it, so the receipt-viewer page Puppeteer prints
 * from is never reloaded.
 */
export const useKioskCommands = (phase: ExperiencePhase) => {
  const trpc = useTRPC();
  // One id per page load, plus the device id the kiosk logs already carry,
  // so the Control Center can tell a reloaded page from the old one.
  const [page] = useState(() => ({
    pageId: createDeviceId(),
    deviceId: initializeBrowserLogging()?.deviceId ?? createDeviceId(),
  }));
  const [pendingReload, setPendingReload] = useState<PendingKioskReload>();

  useSubscription(
    trpc.booth.onKioskCommand.subscriptionOptions(page, {
      onData: (command) => {
        if (command.type !== "reload") return;

        setPendingReload({
          commandId: command.commandId,
          mode: command.mode,
          requestedAt: Date.now(),
        });
      },
    }),
  );

  useEffect(() => {
    if (!pendingReload) return;

    const reloadIfDue = () => {
      const action = getKioskReloadAction({
        ...pendingReload,
        now: Date.now(),
        phase,
      });

      if (action !== "reload") return false;

      logKioskEvent("info", SHUTTER_KIOSK_LOG_SOURCE, "kiosk-reload", {
        details: {
          commandId: pendingReload.commandId,
          mode: pendingReload.mode,
          phase,
        },
      });
      window.location.reload();
      return true;
    };

    if (reloadIfDue()) return;

    // Re-checked on every phase change by this effect; the timer covers a
    // flow that never gets back to idle.
    const timeoutId = window.setTimeout(
      reloadIfDue,
      Math.max(
        0,
        pendingReload.requestedAt + KIOSK_RELOAD_IDLE_TIMEOUT_MS - Date.now(),
      ),
    );

    return () => window.clearTimeout(timeoutId);
  }, [pendingReload, phase]);
};
