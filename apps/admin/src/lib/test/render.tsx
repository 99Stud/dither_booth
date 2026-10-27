import type { RenderOptions, RenderResult } from "@testing-library/react";
import type { FC, ReactElement, ReactNode } from "react";

import { TooltipProvider } from "@dither-booth/ui/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { afterEach } from "bun:test";
import { ThemeProvider } from "next-themes";

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

interface RenderWithProvidersOptions extends Omit<RenderOptions, "wrapper"> {
  /** The theme next-themes starts on. Defaults to `"light"`. */
  theme?: "light" | "dark";
  /** Defaults to a fresh client per render that never retries. */
  queryClient?: QueryClient;
}

/**
 * Renders `ui` inside the providers `main.tsx` gives every Admin screen: the
 * theme, React Query and tooltips. Import it before anything that touches
 * the DOM, as it sets up happy-dom.
 */
export const renderWithProviders = (
  ui: ReactElement,
  {
    theme = "light",
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
    ...options
  }: RenderWithProvidersOptions = {},
): RenderResult & { queryClient: QueryClient } => {
  const Providers: FC<{ children: ReactNode }> = ({ children }) => (
    <ThemeProvider
      attribute="class"
      defaultTheme={theme}
      disableTransitionOnChange
      storageKey={ADMIN_THEME_STORAGE_KEY}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );

  return {
    ...render(ui, { wrapper: Providers, ...options }),
    queryClient,
  };
};
