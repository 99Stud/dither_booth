/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import { ReceiptViewer } from "#app/ReceiptViewer/index.tsx";
import { Root } from "#app/Root/index.tsx";
import {
  RootErrorBoundary,
  RootErrorScreen,
  RootNotFoundScreen,
} from "#app/Root/internal/RootErrorBoundary.tsx";
import { Toaster } from "#components/ui/sonner.tsx";
import { initializeBrowserLogging } from "#lib/logging/logging.utils.ts";
import { queryClient, trpcClient } from "#trpc/client.ts";
import { TRPCProvider } from "#trpc/utils.ts";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Sandbox } from "./app/Sandbox";

const isDevelopment = process.env.NODE_ENV !== "production";

initializeBrowserLogging();

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  errorComponent: ({ error }) => <RootErrorScreen error={error} />,
  notFoundComponent: RootNotFoundScreen,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Root,
});

const receiptViewerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/receipt-viewer",
  component: ReceiptViewer,
});

const sandboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sandbox",
  component: Sandbox,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  receiptViewerRoute,
  sandboxRoute,
]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const elem = document.getElementById("root");

if (!elem) {
  throw new Error('Could not find the app root element with id "root".');
}

const app = (
  <StrictMode>
    <RootErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
          <Toaster />
          <RouterProvider router={router} />
          {isDevelopment && <TanStackRouterDevtools router={router} />}
        </TRPCProvider>
      </QueryClientProvider>
    </RootErrorBoundary>
  </StrictMode>
);

if (import.meta.hot) {
  // With hot module reloading, `import.meta.hot.data` is persisted.
  const root = (import.meta.hot.data.root ??= createRoot(elem));
  root.render(app);
} else {
  // The hot module reloading API is not available in production.
  createRoot(elem).render(app);
}
