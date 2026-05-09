import { RootErrorBoundary } from "#app/Root/internal/components/RootErrorBoundary/index";
import { router } from "#lib/router/index";
import { queryClient, trpcClient } from "#lib/trpc/trpc.client";
import { TRPCProvider } from "#lib/trpc/trpc.utils";
import { initializeBrowserLogging } from "@dither-booth/logging/browser";
import { SidebarProvider } from "@dither-booth/ui/components/ui/sidebar";
import { Toaster } from "@dither-booth/ui/components/ui/sonner";
import { TooltipProvider } from "@dither-booth/ui/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { StrictMode } from "react";

import "./styles/globals.css";
import { createRoot } from "react-dom/client";

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
          <SidebarProvider>
            <TooltipProvider>
              <RouterProvider router={router} />
            </TooltipProvider>
          </SidebarProvider>
          {isDevelopment && <TanStackRouterDevtools router={router} />}
        </TRPCProvider>
      </QueryClientProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
