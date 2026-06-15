import { RECEIPT_VIEWER_PATH } from "@dither-booth/ports/browser";
import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

import { Experience } from "#app/Experience/index";
import { ReceiptViewer } from "#app/ReceiptViewer/index";
import { Root } from "#app/Root/index";
import {
  RootErrorScreen,
  RootNotFoundScreen,
} from "#app/Root/internal/components/RootErrorBoundary/index";

import { RECEIPT_VIEWER_SEARCH_SCHEMA } from "./internal/router.constants";

const rootRoute = createRootRoute({
  component: Root,
  errorComponent: ({ error }) => <RootErrorScreen error={error} />,
  notFoundComponent: RootNotFoundScreen,
});

export const experienceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Experience,
});

export const receiptViewerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: RECEIPT_VIEWER_PATH,
  component: ReceiptViewer,
  validateSearch: RECEIPT_VIEWER_SEARCH_SCHEMA,
});

const routes = [experienceRoute, receiptViewerRoute];

const routeTree = rootRoute.addChildren(routes);

export const router = createRouter({ routeTree });
