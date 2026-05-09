import { ControlCenter } from "#app/ControlCenter/index";
import { PrintConfiguration } from "#app/PrintConfiguration/index";

import type { RouteConfig } from "./router.types";

export const ROUTE_KEYS = ["control-center", "print-configuration"] as const;

export const ROUTES_CONFIG: RouteConfig = new Map([
  [
    "control-center",
    {
      path: "/control-center",
      component: ControlCenter,
    },
  ],
  [
    "print-configuration",
    {
      path: "/print-configuration",
      component: PrintConfiguration,
    },
  ],
]);
