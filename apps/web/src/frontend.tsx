/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `index.html`.
 */

import { RootErrorBoundary } from "#app/Root/internal/components/RootErrorBoundary/index";
import { router } from "#lib/router/index";
import { queryClient, trpcClient } from "#lib/trpc/trpc.client";
import { TRPCProvider } from "#lib/trpc/trpc.utils";
import { initializeBrowserLogging } from "@dither-booth/logging/browser";
import { Toaster } from "@dither-booth/ui/components/ui/sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./styles/globals.css";

const isDevelopment = import.meta.env.DEV;

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

createRoot(elem).render(
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
  </StrictMode>,
);
