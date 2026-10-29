import type { KioskCommand, KioskScreen } from "@dither-booth/shared/kiosk";

import { initializeBrowserLogging } from "@dither-booth/logging/browser";
import { createDeviceId } from "@dither-booth/shared/id";
import { useMutation } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useEffect, useState } from "react";

import { useTRPC } from "#lib/trpc/trpc.client";

import { useKioskCamera } from "./kiosk-camera";

/**
 * The release this page's code came with: its own server's, asked once
 * when the code loads. Module state, so it lasts as long as the code does,
 * across screens and reconnections. Unknown (an older server, no answer)
 * falls back to the first release a stream opens with.
 */
let loadedRelease: string | undefined;
const loadedReleaseRead = fetch("/healthz", { cache: "no-store" })
  .then((response) => (response.ok ? response.json() : null))
  .then((body: { release?: unknown } | null) => {
    if (typeof body?.release === "string") loadedRelease ??= body.release;
  })
  .catch(() => {});

/** Waits between status reports the engine couldn't match to the stream. */
const STATUS_REPORT_RETRY_MS = 1_000;
const STATUS_REPORT_ATTEMPTS = 5;

/**
 * Subscribes this page to the kiosk channel as `screen`, hands each operator
 * command to `onCommand`, and reports the page's camera and whether it shows
 * the maintenance screen to the engine for admin's health checks. Only the
 * Experience and the Darkroom call it, so the receipt-viewer page Puppeteer
 * prints from never subscribes.
 */
export const useKioskCommandStream = (
  screen: KioskScreen,
  isMaintenanceShown: boolean,
  onCommand: (command: KioskCommand) => void,
) => {
  const trpc = useTRPC();
  // One id per page load, plus the device id the kiosk logs already carry,
  // so the admin can tell a reloaded page from the old one.
  const [page] = useState(() => ({
    pageId: createDeviceId(),
    deviceId: initializeBrowserLogging()?.deviceId ?? createDeviceId(),
    screen,
  }));
  const camera = useKioskCamera();
  const { mutateAsync: reportKioskStatus } = useMutation(
    trpc.booth.reportKioskStatus.mutationOptions(),
  );

  const { status } = useSubscription(
    trpc.booth.onKioskCommand.subscriptionOptions(page, {
      // A live view signal is for one page only.
      onData: (command) => {
        if (command.type === "camera" && command.pageId !== page.pageId) return;

        // After an update the engine comes back on another release: this
        // page's code is the old one's. Each screen reloads the way it
        // reloads for staff, the Experience once idle.
        if (command.type === "release") {
          void loadedReleaseRead.then(() => {
            loadedRelease ??= command.release;
            if (command.release !== loadedRelease) {
              onCommand({
                type: "reload",
                mode: "when-idle",
                commandId: command.commandId,
              });
            }
          });
          return;
        }

        onCommand(command);
      },
    }),
  );
  const isConnected = status === "pending";

  // Sent on every status change and on every (re)connection: the engine
  // forgets a page's report when its stream ends.
  useEffect(() => {
    if (!isConnected) return;

    let cancelled = false;
    let timeoutId: number | undefined;

    const report = async (attempt: number) => {
      const result = await reportKioskStatus({
        pageId: page.pageId,
        camera,
        maintenance: isMaintenanceShown,
      }).catch(() => undefined);

      // The stream can be up here before the engine has listed the page.
      if (cancelled || result?.registered !== false) return;
      if (attempt + 1 >= STATUS_REPORT_ATTEMPTS) return;
      timeoutId = window.setTimeout(
        () => void report(attempt + 1),
        STATUS_REPORT_RETRY_MS,
      );
    };

    void report(0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [camera, isConnected, isMaintenanceShown, page.pageId, reportKioskStatus]);
};
