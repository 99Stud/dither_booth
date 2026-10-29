import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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

/**
 * App package root: the nearest folder above the module with a
 * `package.json`. The same answer from the source (`src/lib/…`) and from
 * a bundle (`dist/server.js`), where a fixed `../..` would land in `apps/`.
 */
export function getAppRootFromImportMetaUrl(importMetaUrl: string) {
  let dir = dirname(fileURLToPath(importMetaUrl));

  while (!existsSync(join(dir, "package.json"))) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`No package.json above ${fileURLToPath(importMetaUrl)}.`);
    }
    dir = parent;
  }

  return dir;
}

/** App package root for production entry files compiled from `src/production-entry.ts`. */
export function getProductionEntryAppRoot(importMetaUrl: string) {
  return fileURLToPath(new URL("../", importMetaUrl));
}

/** Monorepo root - only for server/config code, not browser bundles. */
export function getRepoRootFromAppRoot(appRoot: string) {
  return resolve(appRoot, "../..");
}
