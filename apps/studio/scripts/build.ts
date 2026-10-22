// A static site for Cloudflare Pages: the app from src/index.html, the
// service worker at /sw.js (it must sit at the root to control every page),
// and public/ as is.
import tailwindPlugin from "bun-plugin-tailwind";
import { cp, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const dist = resolve(root, "dist");
await rm(dist, { recursive: true, force: true });

const builds = [
  Bun.build({
    entrypoints: [resolve(root, "src/index.html")],
    outdir: dist,
    target: "browser",
    minify: true,
    sourcemap: "linked",
    // The Hub this build talks to: production unless BUN_PUBLIC_* say otherwise.
    env: "BUN_PUBLIC_*",
    plugins: [tailwindPlugin],
  }),
  Bun.build({
    entrypoints: [resolve(root, "src/sw/sw.ts")],
    outdir: dist,
    target: "browser",
    minify: true,
    naming: "sw.js",
  }),
];

for (const result of await Promise.all(builds)) {
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
}
await cp(resolve(root, "public"), dist, { recursive: true });
console.log(`Studio built in ${dist}`);
