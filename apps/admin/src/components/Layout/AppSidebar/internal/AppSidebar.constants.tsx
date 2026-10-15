import type { ReactNode } from "react";

import { Gauge, Ticket } from "lucide-react";

import { ROUTES_CONFIG } from "#lib/router/internal/router.constants";

export const APP_SIDEBAR_MENU_LINKS: Array<{
  label: string;
  /** The label under the icon in the phone's tab bar. */
  shortLabel: string;
  path: string;
  icon: ReactNode;
}> = [
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
