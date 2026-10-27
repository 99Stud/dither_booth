import type { RouteComponent } from "@tanstack/react-router";

import type { ROUTE_KEYS } from "./router.constants";

export type RouteConfig = Map<
  RouteKey,
  {
    path: string;
    component: RouteComponent;
    /** Validates the route's search params, e.g. the Logs page's filter. */
    validateSearch?: (search: Record<string, unknown>) => object;
  }
>;

export type RouteKey = (typeof ROUTE_KEYS)[number];
