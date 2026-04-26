import { fileURLToPath } from "bun";

/** Monorepo root — only for Bun server entry (`src/index.ts`), not browser bundles. */
export const WEB_REPO_ROOT = fileURLToPath(
  new URL("../../../../", import.meta.url),
);
