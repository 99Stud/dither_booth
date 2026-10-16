import { DARKROOM_PATH } from "@dither-booth/shared/darkroom";
import { RECEIPT_VIEWER_PATH } from "@dither-booth/shared/routes";
import { Toaster } from "@dither-booth/ui/components/ui/sonner";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, type FC } from "react";

import { ROOT_LOG_SOURCE } from "#app/Root/internal/Root.constants";
import { applyKitFonts } from "#kits/kitFonts";
import { useKit } from "#kits/useKit";
import { useDarkroomTheme } from "#lib/darkroom/darkroom-theme";
import { reportKioskError } from "#lib/logging/logging.utils";

export const Root: FC = () => {
  const mainRef = useRef<HTMLElement>(null);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  // The receipt viewer and the Darkroom are regular pages that scroll, not
  // the locked-down kiosk shell.
  const isDarkroom = pathname === DARKROOM_PATH;
  const isKioskShell = pathname !== RECEIPT_VIEWER_PATH && !isDarkroom;
  const darkroomTheme = useDarkroomTheme();

  // The Darkroom wears the shared SaaS theme (and its own dark mode); the
  // kiosk and the receipt viewer never do, so prints stay unchanged.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("saas", isDarkroom);
    root.classList.toggle(
      "dark",
      isDarkroom && darkroomTheme.resolved === "dark",
    );
    return () => {
      root.classList.remove("saas", "dark");
    };
  }, [isDarkroom, darkroomTheme.resolved]);

  const kitFonts = useKit().fonts;

  // The kiosk and the tickets wear the kit's fonts; the Darkroom wears the
  // shared theme's.
  useEffect(() => {
    applyKitFonts(isDarkroom ? null : kitFonts);
  }, [isDarkroom, kitFonts]);

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
      // Only the kiosk goes fullscreen on tap, not the Darkroom's keypad.
      onClick={isKioskShell ? enterFullscreen : undefined}
      ref={mainRef}
      data-dither-route-status="ready"
      className={
        isKioskShell ? "relative min-h-dvh overflow-hidden" : "relative"
      }
    >
      <Toaster {...(isDarkroom ? { theme: darkroomTheme.resolved } : {})} />
      <Outlet />
    </main>
  );
};
