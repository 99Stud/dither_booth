/**
 * Public flags from `apps/web/.env` (`BUN_PUBLIC_*`).
 *
 * Bun replaces literal `process.env.BUN_PUBLIC_*` in client bundles when
 * `[serve.static] env = "BUN_PUBLIC_*"` is set in `bunfig.toml` — there is no
 * `import.meta.env` injection like Vite; use this module instead of
 * `import.meta.env` for those variables.
 */
export const ENABLE_PRINT_DEBUG_PANEL =
  process.env.BUN_PUBLIC_ENABLE_PRINT_DEBUG_PANEL === "true";
