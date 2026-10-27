import type { RenderOptions, RenderResult } from "@testing-library/react";
import type { FC, ReactElement, ReactNode } from "react";

import { SidebarProvider } from "@dither-booth/ui/components/ui/sidebar";
import { TooltipProvider } from "@dither-booth/ui/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { cleanup, render } from "@testing-library/react";
import { afterEach } from "bun:test";
import { ThemeProvider } from "next-themes";
import { VirtuosoMockContext } from "react-virtuoso";

import { ADMIN_THEME_STORAGE_KEY } from "#lib/constants";

export * from "@testing-library/react";

// Testing Library binds `screen` to `document.body` when it loads, so the DOM
// has to be preloaded; importing it here would come too late.
if (typeof document === "undefined") {
  throw new Error(
    "Render tests need the DOM. Name the file *.render.test.tsx and run `bun run test:render`.",
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/**
 * happy-dom has no layout, so a virtual list would measure nothing and
 * render no rows. Every `react-virtuoso` list gets this fixed viewport
 * instead: 40 rows of 30 px.
 */
export const TEST_VIRTUAL_LIST_SIZE = { viewportHeight: 1200, itemHeight: 30 };

// Virtuoso skips scrolling a scroller with no height, and a list asked to
// start at its last row then waits forever and renders none. Give its
// scrollers the mock viewport's height; every other element keeps 0.
const offsetHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetHeight",
);
Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  get(this: HTMLElement) {
    return this.hasAttribute("data-virtuoso-scroller")
      ? TEST_VIRTUAL_LIST_SIZE.viewportHeight
      : (offsetHeight?.get?.call(this) ?? 0);
  },
});

interface RenderRouteOptions {
  /** The route `ui` renders at, e.g. `/logs`. */
  path: string;
  /** Where the router starts. Defaults to `path`. */
  url?: string;
  /** The route's search params validator, as the app's router gives it. */
  validateSearch?: (search: Record<string, unknown>) => object;
}

interface RenderWithProvidersOptions extends Omit<RenderOptions, "wrapper"> {
  /** The theme next-themes starts on. Defaults to `"light"`. */
  theme?: "light" | "dark";
  /** Defaults to a fresh client per render that never retries. */
  queryClient?: QueryClient;
  /**
   * Renders `ui` as a route of an in-memory router, for screens that read
   * or write the URL. Every other path renders "Not found".
   */
  route?: RenderRouteOptions;
}

const createTestRouter = (
  ui: ReactElement,
  { path, url = path, validateSearch }: RenderRouteOptions,
) => {
  const rootRoute = createRootRoute({
    component: Outlet,
    notFoundComponent: () => <p>Not found</p>,
  });
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path,
    validateSearch,
    component: () => ui,
  });

  return createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
};

export type TestRouter = ReturnType<typeof createTestRouter>;

/**
 * Renders `ui` inside the providers `main.tsx` gives every Admin screen: the
 * theme, React Query, the sidebar and tooltips. Import it before anything that touches
 * the DOM, as it sets up happy-dom. With `route`, `ui` renders inside a
 * router: wait for it with `findBy…`, and read the URL from `router`.
 */
export const renderWithProviders = (
  ui: ReactElement,
  {
    theme = "light",
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
    route,
    ...options
  }: RenderWithProvidersOptions = {},
): RenderResult & { queryClient: QueryClient; router?: TestRouter } => {
  const Providers: FC<{ children: ReactNode }> = ({ children }) => (
    <ThemeProvider
      attribute="class"
      defaultTheme={theme}
      disableTransitionOnChange
      storageKey={ADMIN_THEME_STORAGE_KEY}
    >
      <QueryClientProvider client={queryClient}>
        <SidebarProvider>
          <TooltipProvider>
            <VirtuosoMockContext.Provider value={TEST_VIRTUAL_LIST_SIZE}>
              {children}
            </VirtuosoMockContext.Provider>
          </TooltipProvider>
        </SidebarProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
  const router = route ? createTestRouter(ui, route) : undefined;

  return {
    ...render(router ? <RouterProvider router={router} /> : ui, {
      wrapper: Providers,
      ...options,
    }),
    queryClient,
    router,
  };
};
