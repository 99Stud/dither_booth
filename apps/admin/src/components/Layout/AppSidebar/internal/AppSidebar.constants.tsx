import type { ReactNode } from "react";

import { BookOpen, Gauge, Settings, Ticket } from "lucide-react";

import { DOCS_PATH } from "#lib/docs/docs.constants";
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

/** The docs site, served by the admin server outside the SPA: a plain link. */
export const APP_DOCS_LINK = {
  label: "Docs",
  href: DOCS_PATH,
  icon: <BookOpen />,
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
