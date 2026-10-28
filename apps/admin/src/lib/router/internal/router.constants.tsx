import { ControlCenter } from "#app/ControlCenter/index";
import { Event } from "#app/Event/index";
import { Logs } from "#app/Logs/index";
import { Settings } from "#app/Settings/index";
import { LOGS_PAGE_PATH, validateLogsSearch } from "#lib/logs/logs.search";

import type { RouteConfig } from "./router.types";

export const ROUTE_KEYS = [
  "control-center",
  "event",
  "settings",
  "logs",
] as const;

export const ROUTES_CONFIG: RouteConfig = new Map([
  [
    "control-center",
    {
      path: "/control-center",
      component: ControlCenter,
    },
  ],
  [
    "event",
    {
      path: "/event",
      component: Event,
    },
  ],
  [
    "settings",
    {
      path: "/settings",
      component: Settings,
    },
  ],
  [
    "logs",
    {
      path: LOGS_PAGE_PATH,
      component: Logs,
      validateSearch: validateLogsSearch,
    },
  ],
]);
