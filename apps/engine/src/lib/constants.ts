import {
  getAppRootFromImportMetaUrl,
  getRepoRootFromAppRoot,
} from "@dither-booth/shared/server/paths";

/** App package root (`apps/engine` - parent of `src` or `dist`). */
export const ENGINE_APP_ROOT = getAppRootFromImportMetaUrl(import.meta.url);

/** Monorepo root - only for server/config code, not browser bundles. */
export const ENGINE_REPO_ROOT = getRepoRootFromAppRoot(ENGINE_APP_ROOT);
