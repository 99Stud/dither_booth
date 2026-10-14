import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const appRoot = resolve(dirname(Bun.fileURLToPath(import.meta.url)), "..");
const distDirectory = resolve(appRoot, "dist");

await rm(distDirectory, { recursive: true, force: true });

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
});

if (!serverResult.success) {
  for (const log of serverResult.logs) {
    console.error(log);
  }

  process.exit(1);
}
