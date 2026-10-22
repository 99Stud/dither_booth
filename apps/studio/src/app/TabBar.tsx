import clsx from "clsx";
import { Bell, Printer, Smartphone } from "lucide-react";

import type { Route } from "#lib/route";

const TABS = [
  { screen: "alerts", label: "Alerts", icon: Bell },
  { screen: "booths", label: "Booths", icon: Printer },
  { screen: "device", label: "This device", icon: Smartphone },
] as const;

/** Studio's three screens, at the bottom where a thumb reaches them. */
export const TabBar = ({
  route,
  onGo,
  openAlerts,
}: {
  route: Route;
  onGo: (route: Route) => void;
  openAlerts: number;
}) => (
  <nav
    aria-label="Studio"
    className={clsx(
      "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur",
      "pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]",
    )}
  >
    <ul className={clsx("mx-auto grid max-w-md grid-cols-3")}>
      {TABS.map(({ screen, label, icon: Icon }) => {
        const current = route.screen === screen;
        return (
          <li key={screen}>
            <button
              type="button"
              aria-current={current ? "page" : undefined}
              onClick={() => onGo({ screen })}
              className={clsx(
                "relative flex w-full flex-col items-center gap-0.5 py-2 text-xs",
                "focus-visible:outline-2 focus-visible:outline-ring",
                current ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <Icon aria-hidden className={clsx("size-5")} />
              {label}
              {screen === "alerts" && openAlerts > 0 ? (
                <span
                  aria-label={`${openAlerts} open`}
                  className={clsx(
                    "absolute top-1 left-1/2 ml-2 min-w-4 rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-white",
                  )}
                >
                  {openAlerts}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  </nav>
);
