import {
  getAppRootFromMain,
  getRepoRootFromAppRoot,
} from "@dither-booth/shared/server/paths";

/** App package root (`apps/shutter` - parent of `src` or `dist`). */
export const SHUTTER_APP_ROOT = getAppRootFromMain();

/** Monorepo root - only for server/config code, not browser bundles. */
export const SHUTTER_REPO_ROOT = getRepoRootFromAppRoot(SHUTTER_APP_ROOT);
