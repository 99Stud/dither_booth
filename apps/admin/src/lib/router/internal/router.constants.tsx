import { ControlCenter } from "#app/ControlCenter/index";
import { Event } from "#app/Event/index";

import type { RouteConfig } from "./router.types";

export const ROUTE_KEYS = ["control-center", "event"] as const;

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
]);
