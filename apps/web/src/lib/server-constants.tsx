import { fileURLToPath } from "node:url";

/** Monorepo root — only for server/config code, not browser bundles. */
export const WEB_REPO_ROOT = fileURLToPath(
  new URL("../../../../", import.meta.url),
);
