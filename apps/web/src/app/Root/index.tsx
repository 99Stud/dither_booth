import { Toaster } from "@dither-booth/ui/components/ui/sonner";
import { Outlet } from "@tanstack/react-router";
import { useRef, type FC } from "react";

import { ROOT_LOG_SOURCE } from "#app/Root/internal/Root.constants";
import { reportKioskError } from "#lib/logging/logging.utils";

export const Root: FC = () => {
  const mainRef = useRef<HTMLElement>(null);

  const enterFullscreen = () => {
    if (mainRef.current) {
      const fullscreenActive = !!document.fullscreenElement;

      if (!fullscreenActive) {
        mainRef.current
          .requestFullscreen({
            navigationUI: "hide",
          })
          .catch((err) => {
            reportKioskError(err, {
              event: "root-fullscreen-enable-failed",
              source: ROOT_LOG_SOURCE,
              userMessage: "Failed to enter fullscreen.",
            });
          });
      }
    }
  };

  return (
    <main
      onClick={enterFullscreen}
      ref={mainRef}
      data-dither-route-status="ready"
    >
      <Toaster />
      <Outlet />
    </main>
  );
};
