/**
 * What to tell staff about a failed call: the engine's own message (a bad
 * code, no internet) when it gave one, else a plain fallback.
 */
export const errorMessage = (
  error: unknown,
  fallback = "Something went wrong.",
) => (error instanceof Error && error.message ? error.message : fallback);
