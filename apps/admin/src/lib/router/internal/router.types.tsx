import type { RouteComponent } from "@tanstack/react-router";

import type { ROUTE_KEYS } from "./router.constants";

export type RouteConfig = Map<
  RouteKey,
  {
    path: string;
    component: RouteComponent;
  }
>;

export type RouteKey = (typeof ROUTE_KEYS)[number];
