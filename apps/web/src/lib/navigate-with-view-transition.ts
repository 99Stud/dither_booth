import type { NavigateOptions, RegisteredRouter } from "@tanstack/react-router";

type NavigateFn = (opts: NavigateOptions<RegisteredRouter>) => Promise<void>;

export const navigateWithViewTransition = (
  navigate: NavigateFn,
  opts: NavigateOptions<RegisteredRouter>,
) => {
  if (
    typeof document !== "undefined" &&
    "startViewTransition" in document &&
    typeof document.startViewTransition === "function"
  ) {
    document.startViewTransition(() => {
      void navigate(opts);
    });
    return;
  }

  void navigate(opts);
};
