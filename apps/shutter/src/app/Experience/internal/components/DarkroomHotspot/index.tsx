import type { FC } from "react";

import { logKioskEvent } from "@dither-booth/logging";
import { DARKROOM_PATH } from "@dither-booth/shared/darkroom";
import { useNavigate } from "@tanstack/react-router";
import clsx from "clsx";
import { useEffect, useRef } from "react";

import { SHUTTER_KIOSK_LOG_SOURCE } from "#lib/constants";

import { DARKROOM_HOTSPOT_HOLD_MS } from "../../Experience.constants";

/**
 * The staff way into the Darkroom: an invisible square in the landing
 * screen's top-left corner. Holding it for 3 s opens /darkroom, which asks
 * for the PIN. Guests tapping around never hold it that long.
 */
export const DarkroomHotspot: FC<{ isEnabled: boolean }> = ({ isEnabled }) => {
  const navigate = useNavigate();
  const timeoutIdRef = useRef<number | undefined>(undefined);

  const cancel = () => {
    window.clearTimeout(timeoutIdRef.current);
    timeoutIdRef.current = undefined;
  };

  // A hold still running when the visit starts (or the page unmounts) never
  // opens the Darkroom.
  useEffect(() => {
    if (!isEnabled) cancel();
    return cancel;
  }, [isEnabled]);

  if (!isEnabled) return null;

  return (
    <div
      aria-hidden
      className={clsx("fixed top-0 left-0 z-50", "size-16", "touch-none")}
      onContextMenu={(event) => event.preventDefault()}
      onPointerCancel={cancel}
      onPointerDown={() => {
        cancel();
        timeoutIdRef.current = window.setTimeout(() => {
          logKioskEvent("info", SHUTTER_KIOSK_LOG_SOURCE, "darkroom-opened");
          void navigate({ to: DARKROOM_PATH });
        }, DARKROOM_HOTSPOT_HOLD_MS);
      }}
      onPointerLeave={cancel}
      onPointerUp={cancel}
    />
  );
};
