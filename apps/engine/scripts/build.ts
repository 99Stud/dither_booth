import type { BunPlugin } from "bun";

import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const appRoot = resolve(dirname(Bun.fileURLToPath(import.meta.url)), "..");
const distDirectory = resolve(appRoot, "dist");

await rm(distDirectory, { recursive: true, force: true });

/**
 * `packages: "external"` keeps node_modules out of the bundle, and would
 * leave the engine's own `#*` imports (package.json "imports", pointing at
 * `src/`) outside it too. A release bundle ships `dist/`, not `src/`: they
 * are bundled here, as package.json maps them.
 */
const engineSourceAliases: BunPlugin = {
  name: "engine-source-aliases",
  setup(build) {
    build.onResolve({ filter: /^#/u }, (args) => ({
      path: resolve(appRoot, "src", `${args.path.slice(1)}.ts`),
    }));
  },
};

const nodeEnv = Bun.env.NODE_ENV ?? "production";
const serverResult = await Bun.build({
  entrypoints: [resolve(appRoot, "src/production-entry.ts")],
  outdir: distDirectory,
  target: "bun",
  packages: "external",
  splitting: false,
  minify: nodeEnv === "production",
  sourcemap: "none",
  naming: {
    entry: "server.[ext]",
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(nodeEnv),
  },
  plugins: [engineSourceAliases],
});

if (!serverResult.success) {
  for (const log of serverResult.logs) {
    console.error(log);
  }

  process.exit(1);
}
