import {
  RootErrorScreen,
  RootNotFoundScreen,
} from "#app/Root/internal/components/RootErrorBoundary/index.tsx";
import { HudBackground } from "#components/backgrounds/HudBackground/HudBackground.tsx";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";

import type { FC } from "react";

import { ROUTES_CONFIG } from "./internal/router.constants";

const RootLayout: FC = () => {
  return (
    <div className="relative min-h-dvh bg-background text-foreground">
      <HudBackground />
      <div className="relative z-10 min-h-dvh min-w-0 w-full">
        <Outlet />
      </div>
    </div>
  );
};

const rootRoute = createRootRoute({
  component: RootLayout,
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
