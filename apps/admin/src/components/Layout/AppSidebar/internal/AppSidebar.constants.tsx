import type { ReactNode } from "react";

import {
  BookOpen,
  Cpu,
  Gauge,
  ScrollText,
  Settings,
  Ticket,
} from "lucide-react";

import { DOCS_PATH } from "#lib/docs/docs.constants";
import { LOGS_PAGE_PATH } from "#lib/logs/logs.search";
import { ROUTES_CONFIG } from "#lib/router/internal/router.constants";
import { SYSTEM_PAGE_PATH } from "#lib/system/system.constants";

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

/**
 * The Logs page: a tech tool, next to Docs at the sidebar's foot, out of the
 * client's way. Not in the phone's tab bar: phones reach it from Settings.
 */
export const APP_LOGS_LINK = {
  label: "Logs",
  path: LOGS_PAGE_PATH,
  icon: <ScrollText />,
};

/**
 * The System page: the Pi's heat, memory, CPU and storage, next to Logs
 * at the sidebar's foot. Not in the phone's tab bar: phones reach it from
 * Settings.
 */
export const APP_SYSTEM_LINK = {
  label: "System",
  path: SYSTEM_PAGE_PATH,
  icon: <Cpu />,
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
