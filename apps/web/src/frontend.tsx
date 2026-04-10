/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import { Booth } from "#app/Booth/index.tsx";
import { Names } from "#app/Names/index.tsx";
import { ReceiptViewer } from "#app/ReceiptViewer/index.tsx";
import {
  RootErrorBoundary,
  RootErrorScreen,
  RootNotFoundScreen,
} from "#app/Root/internal/components/RootErrorBoundary/index.tsx";
import { Splash } from "#app/Splash/index.tsx";
import { Toaster } from "#components/ui/sonner.tsx";
import { queryClient, trpcClient } from "#lib/trpc/trpc.client.ts";
import { TRPCProvider } from "#lib/trpc/trpc.utils.ts";
import { initializeBrowserLogging } from "@dither-booth/logging/browser";
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
import { ThemeProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";

import { Sandbox } from "./app/Sandbox";

const isDevelopment = process.env.NODE_ENV !== "production";

initializeBrowserLogging();

const rootRoute = createRootRoute({
  component: () => (
    <NuqsAdapter>
      <Outlet />
    </NuqsAdapter>
  ),
  errorComponent: ({ error }) => <RootErrorScreen error={error} />,
  notFoundComponent: RootNotFoundScreen,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Splash,
});

const namesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/names",
  component: Names,
});

const boothRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/booth",
  component: Booth,
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
  namesRoute,
  boothRoute,
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
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      forcedTheme="dark"
    >
      <RootErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
            <Toaster />
            <RouterProvider router={router} />
            {isDevelopment && <TanStackRouterDevtools router={router} />}
          </TRPCProvider>
        </QueryClientProvider>
      </RootErrorBoundary>
    </ThemeProvider>
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
