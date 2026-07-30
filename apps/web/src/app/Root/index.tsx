import { Outlet, useRouterState } from "@tanstack/react-router";
import { type FC, useEffect } from "react";

import { RECEIPT_VIEWER_PATH } from "@dither-booth/shared/routes";

export const Root: FC = () => {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isKioskShell = pathname !== RECEIPT_VIEWER_PATH;

  useEffect(() => {
    document.documentElement.classList.toggle("kiosk-shell", isKioskShell);
    return () => {
      document.documentElement.classList.remove("kiosk-shell");
    };
  }, [isKioskShell]);

  return (
    <main
      data-dither-route-status="ready"
      className={
        isKioskShell ? "relative min-h-dvh overflow-hidden" : "relative"
      }
    >
      <Outlet />
    </main>
  );
};
