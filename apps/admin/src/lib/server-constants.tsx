import {
  getAppRootFromMain,
  getRepoRootFromAppRoot,
} from "@dither-booth/shared/paths";

/** App package root (`apps/admin` - parent of `src` or `dist`). */
export const ADMIN_APP_ROOT = getAppRootFromMain();

/** Monorepo root - only for server/config code, not browser bundles. */
export const ADMIN_REPO_ROOT = getRepoRootFromAppRoot(ADMIN_APP_ROOT);
