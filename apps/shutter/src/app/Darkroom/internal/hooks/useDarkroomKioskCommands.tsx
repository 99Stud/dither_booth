import { logKioskEvent } from "@dither-booth/logging";
import { useNavigate } from "@tanstack/react-router";

import { getDarkroomToken } from "#lib/darkroom/darkroom-token";
import { useKioskCommandStream } from "#lib/kiosk/useKioskCommandStream";

import { DARKROOM_LOG_SOURCE } from "../Darkroom.constants";
import { useLockDarkroom } from "./useLockDarkroom";

/**
 * Runs the operator's commands while the kiosk shows the Darkroom, PIN
 * screen included. No guest visit to protect here, so each runs straight
 * away. Going back to the Shutter locks first: the operator is not at the
 * kiosk to do it.
 */
export const useDarkroomKioskCommands = () => {
  const navigate = useNavigate();
  const { lock } = useLockDarkroom();

  useKioskCommandStream("darkroom", (command) => {
    logKioskEvent("info", DARKROOM_LOG_SOURCE, "darkroom-kiosk-command", {
      details: { commandId: command.commandId, type: command.type },
    });

    if (command.type === "reload") {
      window.location.reload();
      return;
    }

    if (command.screen !== "shutter") return;

    void (async () => {
      if (getDarkroomToken()) await lock();
      await navigate({ to: "/" });
    })();
  });
};
