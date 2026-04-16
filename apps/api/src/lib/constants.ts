import { fileURLToPath } from "bun";

export const API_REPO_ROOT = fileURLToPath(
  new URL("../../../../", import.meta.url),
);
