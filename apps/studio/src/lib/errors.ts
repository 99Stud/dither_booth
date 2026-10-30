/** What to tell staff when something failed: its own message, or `fallback`. */
export const messageOf = (
  error: unknown,
  fallback = "Something went wrong.",
) => (error instanceof Error && error.message ? error.message : fallback);

/** The Postgres code of an error the Hub returned (`23505`, `42501`…), if any. */
export const postgresCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
