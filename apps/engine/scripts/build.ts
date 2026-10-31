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

/**
 * The server, and what the CLI runs on a release, which has no `scripts/`
 * or `src/`: the certificate generator for `booth cert` (named by
 * `certGenerateArgs` and the release workflow's smoke test), and the staff
 * PIN setter for `booth pin` (named by `setStaffPinArgs`).
 */
const entries = [
  { source: "src/production-entry.ts", name: "server" },
  { source: "scripts/generate-local-cert.ts", name: "generate-local-cert" },
  { source: "src/domains/darkroom/darkroom.set-pin.ts", name: "set-staff-pin" },
];

for (const entry of entries) {
  const result = await Bun.build({
    entrypoints: [resolve(appRoot, entry.source)],
    outdir: distDirectory,
    target: "bun",
    packages: "external",
    splitting: false,
    minify: nodeEnv === "production",
    sourcemap: "none",
    naming: {
      entry: `${entry.name}.[ext]`,
    },
    define: {
      "process.env.NODE_ENV": JSON.stringify(nodeEnv),
    },
    plugins: [engineSourceAliases],
  });

  if (!result.success) {
    for (const log of result.logs) {
      console.error(log);
    }

    process.exit(1);
  }
}
