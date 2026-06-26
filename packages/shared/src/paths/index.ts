import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function requireBunMainPath() {
  const main = Bun.main;

  if (!main) {
    throw new Error("Bun.main is not set; cannot resolve app paths.");
  }

  return main;
}

/** App package root (`apps/*` - parent of `src` or `dist`). */
export function getAppRootFromMain(mainPath = requireBunMainPath()) {
  return resolve(dirname(mainPath), "..");
}

/** App package root resolved relative to the module that owns the constant. */
export function getAppRootFromImportMetaUrl(
  importMetaUrl: string,
  relativePath = "../..",
) {
  return resolve(dirname(fileURLToPath(importMetaUrl)), relativePath);
}

/** App package root for production entry files compiled from `src/production-entry.ts`. */
export function getProductionEntryAppRoot(importMetaUrl: string) {
  return fileURLToPath(new URL("../", importMetaUrl));
}

/** Monorepo root - only for server/config code, not browser bundles. */
export function getRepoRootFromAppRoot(appRoot: string) {
  return resolve(appRoot, "../..");
}
