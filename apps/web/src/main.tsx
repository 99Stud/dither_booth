/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `index.html`.
 */

import { initializeBrowserLogging } from "@dither-booth/logging/browser";
import {
  RECEIPT_VIEWER_TEMPLATE_ATTRIBUTE,
  buildReceiptViewerSearch,
  installReceiptViewerNavigationBridge,
} from "@dither-booth/shared/browser/receipt-viewer";
import { RECEIPT_VIEWER_PATH } from "@dither-booth/shared/routes";
import { Toaster } from "@dither-booth/ui/components/ui/sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { RootErrorBoundary } from "#app/Root/internal/components/RootErrorBoundary/index";
import { installKioskFullscreen } from "#lib/kiosk-fullscreen";
import { router } from "#lib/router/index";
import { TRPCProvider, queryClient, trpcClient } from "#lib/trpc/trpc.client";

import "./styles/globals.css";

const isDevelopment =
  typeof process !== "undefined" && process.env.NODE_ENV === "development";

const WEB_APP_MANIFEST_HREF = "/manifest.webmanifest";

if (typeof document !== "undefined") {
  let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "manifest";
    document.head.appendChild(link);
  }
  link.href = WEB_APP_MANIFEST_HREF;

  installKioskFullscreen();
}

initializeBrowserLogging();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const RECEIPT_VIEWER_SEARCH_KEYS = [
  "template",
  "outcome",
  "prizeId",
  "lotLabel",
  "lotRarity",
  "wonAt",
  "ticketRef",
] as const;

installReceiptViewerNavigationBridge({
  isRouteStateCommitted: (options = {}) => {
    const expected = buildReceiptViewerSearch(options);
    const { pathname, search } = router.state.location;

    if (pathname !== RECEIPT_VIEWER_PATH) {
      return false;
    }

    for (const key of RECEIPT_VIEWER_SEARCH_KEYS) {
      if (search[key] !== expected[key]) {
        return false;
      }
    }

    const templateAttribute =
      document
        .querySelector(`[${RECEIPT_VIEWER_TEMPLATE_ATTRIBUTE}]`)
        ?.getAttribute(RECEIPT_VIEWER_TEMPLATE_ATTRIBUTE) ?? null;

    if (expected.template) {
      return templateAttribute === expected.template;
    }

    return templateAttribute === "";
  },
  navigate: async (options = {}) => {
    const search = buildReceiptViewerSearch(options);
    // Function form ignores previous params so lottery fields cannot leak/stick.
    await router.navigate({
      to: RECEIPT_VIEWER_PATH,
      search: () => search,
    });
  },
});

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
