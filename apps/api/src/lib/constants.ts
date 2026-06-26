import {
  getAppRootFromImportMetaUrl,
  getRepoRootFromAppRoot,
} from "@dither-booth/shared/paths";

/** App package root (`apps/api` - parent of `src` or `dist`). */
export const API_APP_ROOT = getAppRootFromImportMetaUrl(import.meta.url);

/** Monorepo root - only for server/config code, not browser bundles. */
export const API_REPO_ROOT = getRepoRootFromAppRoot(API_APP_ROOT);
