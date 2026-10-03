import { RECEIPT_VIEWER_PATH } from "@dither-booth/shared/routes";
import { Toaster } from "@dither-booth/ui/components/ui/sonner";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, type FC } from "react";

import { ROOT_LOG_SOURCE } from "#app/Root/internal/Root.constants";
import { reportKioskError } from "#lib/logging/logging.utils";

export const Root: FC = () => {
  const mainRef = useRef<HTMLElement>(null);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const isKioskShell = pathname !== RECEIPT_VIEWER_PATH;

  useEffect(() => {
    document.documentElement.classList.toggle("kiosk-shell", isKioskShell);
    return () => {
      document.documentElement.classList.remove("kiosk-shell");
    };
  }, [isKioskShell]);

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
      className={
        isKioskShell ? "relative min-h-dvh overflow-hidden" : "relative"
      }
    >
      <Toaster />
      <Outlet />
    </main>
  );
};
