import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const bunInterpreter = resolve(repoRoot, "node_modules", ".bin", "bun");

export const apps = [
  {
    name: "dither-booth-api",
    cwd: resolve(repoRoot, "apps", "api"),
    script: bunInterpreter,
    args: ["dist/server.js"],
    interpreter: "none",
    env: {
      NODE_ENV: "production",
    },
  },
  {
    name: "dither-booth-admin",
    cwd: resolve(repoRoot, "apps", "admin"),
    script: bunInterpreter,
    args: ["dist/server.js"],
    interpreter: "none",
    env: {
      NODE_ENV: "production",
    },
  },
  {
    name: "dither-booth-web",
    cwd: resolve(repoRoot, "apps", "web"),
    script: bunInterpreter,
    args: ["dist/server.js"],
    interpreter: "none",
    env: {
      NODE_ENV: "production",
    },
  },
];

export default { apps };
