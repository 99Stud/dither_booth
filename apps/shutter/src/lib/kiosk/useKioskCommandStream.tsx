import type { KioskCommand, KioskScreen } from "@dither-booth/shared/kiosk";

import { initializeBrowserLogging } from "@dither-booth/logging/browser";
import { createDeviceId } from "@dither-booth/shared/id";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useState } from "react";

import { useTRPC } from "#lib/trpc/trpc.client";

/**
 * Subscribes this page to the kiosk channel as `screen` and hands each
 * operator command to `onCommand`. Only the Experience and the Darkroom call
 * it, so the receipt-viewer page Puppeteer prints from never subscribes.
 */
export const useKioskCommandStream = (
  screen: KioskScreen,
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

  useSubscription(
    trpc.booth.onKioskCommand.subscriptionOptions(page, {
      onData: onCommand,
    }),
  );
};
