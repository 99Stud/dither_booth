/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import { RootErrorBoundary } from "#app/Root/internal/components/RootErrorBoundary/index";
import { Toaster } from "#components/ui/sonner";
import { router } from "#lib/router/index";
import { queryClient, trpcClient } from "#lib/trpc/trpc.client";
import { TRPCProvider } from "#lib/trpc/trpc.utils";
import { initializeBrowserLogging } from "@dither-booth/logging/browser";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const isDevelopment = process.env.NODE_ENV !== "production";

initializeBrowserLogging();

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
