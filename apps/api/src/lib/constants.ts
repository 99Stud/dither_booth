import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** App package root (`apps/api` — parent of `src` or `dist`). */
export const API_APP_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

/** Monorepo root — only for server/config code, not browser bundles. */
export const API_REPO_ROOT = resolve(API_APP_ROOT, "../..");
