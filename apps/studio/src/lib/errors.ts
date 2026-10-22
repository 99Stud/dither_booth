/** What to tell staff when something failed: its own message, or `fallback`. */
export const messageOf = (
  error: unknown,
  fallback = "Something went wrong.",
) => (error instanceof Error && error.message ? error.message : fallback);
