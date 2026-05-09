import { Root } from "#app/Root/index";
import {
  RootErrorScreen,
  RootNotFoundScreen,
} from "#app/Root/internal/components/RootErrorBoundary/index";
import {
  createRootRoute,
  createRoute,
  createRouter,
  type AnyRoute,
} from "@tanstack/react-router";

import { ROUTE_KEYS, ROUTES_CONFIG } from "./internal/router.constants";

const rootRoute = createRootRoute({
  component: Root,
  errorComponent: ({ error }) => <RootErrorScreen error={error} />,
  notFoundComponent: RootNotFoundScreen,
});

const routes = ROUTE_KEYS.reduce<Array<AnyRoute>>((routes, routeKey) => {
  const routeConfig = ROUTES_CONFIG.get(routeKey);
  if (routeConfig) {
    const test = createRoute({
      getParentRoute: () => rootRoute,
      path: routeConfig.path,
      component: routeConfig.component,
    });

    routes.push(test);
  }

  return routes;
}, []);

const routeTree = rootRoute.addChildren(routes);

export const router = createRouter({ routeTree });
