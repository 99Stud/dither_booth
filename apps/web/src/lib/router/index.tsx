import {
  RootErrorScreen,
  RootNotFoundScreen,
} from "#app/Root/internal/components/RootErrorBoundary/index";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";

import { ROUTES_CONFIG } from "./internal/router.constants";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  errorComponent: ({ error }) => <RootErrorScreen error={error} />,
  notFoundComponent: RootNotFoundScreen,
});

const routes = ROUTES_CONFIG.map((route) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: route.path,
    component: route.component,
  }),
);

const routeTree = rootRoute.addChildren(routes);

export const router = createRouter({ routeTree });
