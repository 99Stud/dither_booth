import type { ReactNode } from "react";

import { Gauge, Settings, Ticket } from "lucide-react";

import { ROUTES_CONFIG } from "#lib/router/internal/router.constants";

type AppNavLink = {
  label: string;
  /** The label under the icon in the phone's tab bar. */
  shortLabel: string;
  path: string;
  icon: ReactNode;
};

/** The settings: last in the phone's tab bar, at the sidebar's foot. */
export const APP_SETTINGS_LINK: AppNavLink = {
  label: "Settings",
  shortLabel: "Settings",
  path: ROUTES_CONFIG.get("settings")!.path,
  icon: <Settings />,
};

export const APP_SIDEBAR_MENU_LINKS: AppNavLink[] = [
  {
    label: "Control center",
    shortLabel: "Booth",
    path: ROUTES_CONFIG.get("control-center")!.path,
    icon: <Gauge />,
  },
  {
    label: "Event",
    shortLabel: "Event",
    path: ROUTES_CONFIG.get("event")!.path,
    icon: <Ticket />,
  },
];
