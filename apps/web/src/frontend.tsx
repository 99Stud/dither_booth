/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import { RootErrorBoundary } from "#app/Root/internal/components/RootErrorBoundary/index.tsx";
import { Toaster } from "#components/ui/sonner.tsx";
import { router } from "#lib/router/index.tsx";
import { queryClient, trpcClient } from "#lib/trpc/trpc.client.ts";
import { TRPCProvider } from "#lib/trpc/trpc.utils.ts";
import { initializeBrowserLogging } from "@dither-booth/logging/browser";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";

const TanStackRouterDevtoolsLazy = lazy(() =>
  import("@tanstack/react-router-devtools").then((m) => ({
    default: m.TanStackRouterDevtools,
  })),
);

const showRouterDevtools = process.env.NODE_ENV === "development";

const WEB_APP_MANIFEST_HREF = "/manifest.webmanifest";

if (typeof document !== "undefined") {
  let link: HTMLLinkElement | null = document.querySelector('link[rel="manifest"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "manifest";
    document.head.appendChild(link);
  }
  link.href = WEB_APP_MANIFEST_HREF;
}

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
            <NuqsAdapter>
              <RouterProvider router={router} />
            </NuqsAdapter>
            {showRouterDevtools && (
              <Suspense fallback={null}>
                <TanStackRouterDevtoolsLazy router={router} />
              </Suspense>
            )}
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
