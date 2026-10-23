import { initializeBrowserLogging } from "@dither-booth/logging/browser";
import { linkBrandIcons } from "@dither-booth/ui/brand";
import { SidebarProvider } from "@dither-booth/ui/components/ui/sidebar";
import { Toaster } from "@dither-booth/ui/components/ui/sonner";
import { TooltipProvider } from "@dither-booth/ui/components/ui/tooltip";
import { watchVirtualKeyboard } from "@dither-booth/ui/virtual-keyboard";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { RootErrorBoundary } from "#app/Root/internal/components/RootErrorBoundary/index";
import { ADMIN_THEME_STORAGE_KEY } from "#lib/constants";
import { router } from "#lib/router/index";
import { TRPCProvider, queryClient, trpcClient } from "#lib/trpc/trpc.client";

import "./styles/globals.css";

const isDevelopment =
  typeof process !== "undefined" && process.env.NODE_ENV === "development";

/** Phones and tablets: iOS conventions for toasts, no router devtools. */
const isTouch = window.matchMedia("(pointer: coarse)").matches;

initializeBrowserLogging();
watchVirtualKeyboard();
linkBrandIcons({ appleTouchIcon: "/icons/icon-180.png" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      disableTransitionOnChange
      enableSystem
      storageKey={ADMIN_THEME_STORAGE_KEY}
    >
      <RootErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
            {/* On touch screens toasts drop from the top, as iOS banners do,
                clear of the tab bar and the keyboard. */}
            <Toaster position={isTouch ? "top-center" : "bottom-right"} />
            <SidebarProvider>
              <TooltipProvider>
                <RouterProvider router={router} />
              </TooltipProvider>
            </SidebarProvider>
            {isDevelopment && !isTouch && (
              <TanStackRouterDevtools router={router} />
            )}
          </TRPCProvider>
        </QueryClientProvider>
      </RootErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
);
