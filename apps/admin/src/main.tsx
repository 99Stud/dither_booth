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

const isDevelopment =
  typeof process !== "undefined" && process.env.NODE_ENV === "development";

initializeBrowserLogging();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
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
