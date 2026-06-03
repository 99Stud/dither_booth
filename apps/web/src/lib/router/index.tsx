import type { FC } from "react";

import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";

import { AdminHeirveyReceipt } from "#app/AdminHeirveyReceipt/index.tsx";
import { ReceiptViewer } from "#app/ReceiptViewer/index.tsx";
import {
  RootErrorScreen,
  RootNotFoundScreen,
} from "#app/Root/internal/components/RootErrorBoundary/index.tsx";
import { HudBackground } from "#components/backgrounds/HudBackground/HudBackground.tsx";

import {
  RECEIPT_VIEWER_SEARCH_SCHEMA,
  ROUTES_CONFIG,
} from "./internal/router.constants";

const RootLayout: FC = () => {
  return (
    <div className="relative min-h-dvh bg-background text-foreground">
      <HudBackground />
      <div className="relative z-10 min-h-dvh w-full min-w-0">
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

export const receiptViewerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/receipt-viewer",
  component: ReceiptViewer,
  validateSearch: RECEIPT_VIEWER_SEARCH_SCHEMA,
});

const adminHeirveyReceiptRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/heirvey-receipt",
  component: AdminHeirveyReceipt,
});
const otherRoutes = ROUTES_CONFIG.map((route) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: route.path,
    component: route.component,
  }),
);

const routeTree = rootRoute.addChildren([
  receiptViewerRoute,
  adminHeirveyReceiptRoute,
  ...otherRoutes,
]);

export const router = createRouter({ routeTree });
