import { dirname, resolve } from "node:path";

function requireMainPath() {
  const main = Bun.main;

  if (!main) {
    throw new Error("Bun.main is not set; cannot resolve app paths.");
  }

  return main;
}

/** App package root (`apps/admin` — parent of `src` or `dist`). */
export const ADMIN_APP_ROOT = resolve(dirname(requireMainPath()), "..");

/** Monorepo root — only for server/config code, not browser bundles. */
export const ADMIN_REPO_ROOT = resolve(ADMIN_APP_ROOT, "../..");
