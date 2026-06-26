import {
  getAppRootFromMain,
  getRepoRootFromAppRoot,
} from "@dither-booth/shared/paths";

/** App package root (`apps/web` - parent of `src` or `dist`). */
export const WEB_APP_ROOT = getAppRootFromMain();

/** Monorepo root - only for server/config code, not browser bundles. */
export const WEB_REPO_ROOT = getRepoRootFromAppRoot(WEB_APP_ROOT);
