import { DARKROOM_PATH } from "@dither-booth/shared/darkroom";
import {
  KIT_PREVIEW_PATH,
  KIT_PREVIEW_SURFACES,
} from "@dither-booth/shared/kit-preview";
import {
  RECEIPT_VIEWER_PATH,
  RECEIPT_VIEWER_SEARCH_SCHEMA,
} from "@dither-booth/shared/routes";
import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import z from "zod";

import { Darkroom } from "#app/Darkroom/index";
import { Experience } from "#app/Experience/index";
import { KitPreview } from "#app/KitPreview/index";
import { ReceiptViewer } from "#app/ReceiptViewer/index";
import { Root } from "#app/Root/index";
import {
  RootErrorScreen,
  RootNotFoundScreen,
} from "#app/Root/internal/components/RootErrorBoundary/index";

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

export const darkroomRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: DARKROOM_PATH,
  component: Darkroom,
});

export const kitPreviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: KIT_PREVIEW_PATH,
  component: KitPreview,
  validateSearch: z.object({
    surface: z.enum(KIT_PREVIEW_SURFACES).catch("landing"),
  }),
});

const routes = [
  experienceRoute,
  receiptViewerRoute,
  darkroomRoute,
  kitPreviewRoute,
];

const routeTree = rootRoute.addChildren(routes);

export const router = createRouter({ routeTree });
