import type { FC } from "react";

import { logKioskEvent } from "@dither-booth/logging";
import { DARKROOM_PATH } from "@dither-booth/shared/darkroom";
import { useNavigate } from "@tanstack/react-router";
import clsx from "clsx";
import { useRef } from "react";

import { SHUTTER_KIOSK_LOG_SOURCE } from "#lib/constants";

import { registerDarkroomTap } from "../../Experience.darkroom";

/**
 * The staff way into the Darkroom: an invisible zone over the landing
 * screen's top-left Dither Booth logo (same position and size as the logo in
 * IntroChrome). Tapping it 4 times within 2 s opens /darkroom, which asks for
 * the PIN.
 *
 * It sits above the full-screen start button, so a tap on the logo never
 * starts a visit, even a single stray one.
 */
export const DarkroomHotspot: FC<{ isEnabled: boolean }> = ({ isEnabled }) => {
  const navigate = useNavigate();
  const tapsRef = useRef<number[]>([]);

  if (!isEnabled) return null;

  return (
    <div
      aria-hidden
      className={clsx(
        "fixed top-14 left-14 z-30",
        // The DitherBoothLogo's own box: h-20 and its viewBox ratio.
        "aspect-[858.7/304.09] h-20",
        "touch-manipulation",
      )}
      onContextMenu={(event) => event.preventDefault()}
      onClick={() => {
        const { taps, opens } = registerDarkroomTap(
          tapsRef.current,
          Date.now(),
        );
        tapsRef.current = taps;

        if (!opens) return;

        logKioskEvent("info", SHUTTER_KIOSK_LOG_SOURCE, "darkroom-opened");
        void navigate({ to: DARKROOM_PATH });
      }}
    />
  );
};
