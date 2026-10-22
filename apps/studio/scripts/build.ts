// A static site for Cloudflare Pages: the app from src/index.html, the
// service worker at /sw.js (it must sit at the root to control every page),
// and public/ as is.
import tailwindPlugin from "bun-plugin-tailwind";
import { cp, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

/** What src/lib/hub.ts reads at build time. */
const PUBLIC_VALUES = [
  "BUN_PUBLIC_HUB_URL",
  "BUN_PUBLIC_HUB_PUBLISHABLE_KEY",
  "BUN_PUBLIC_VAPID_PUBLIC_KEY",
] as const;
const dist = resolve(root, "dist");
await rm(dist, { recursive: true, force: true });

const builds = [
  Bun.build({
    entrypoints: [resolve(root, "src/index.html")],
    outdir: dist,
    target: "browser",
    minify: true,
    sourcemap: "linked",
    // The Hub this build talks to: production unless BUN_PUBLIC_* say
    // otherwise. Each is replaced even when unset (by ""), as Bun's `env`
    // option would leave an unset one as process.env.X.
    define: Object.fromEntries(
      PUBLIC_VALUES.map((name) => [
        `process.env.${name}`,
        JSON.stringify(process.env[name] ?? ""),
      ]),
    ),
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
// A browser has no `process`: anything still reading it would crash the
// page on load (a black screen). The defines above leave none; this keeps it so.
for (const file of new Bun.Glob("**/*.js").scanSync(dist)) {
  const leftover = (await Bun.file(resolve(dist, file)).text()).match(
    /process\.env\.\w+/u,
  );
  if (leftover) {
    console.error(
      `${file} still reads ${leftover[0]}: it would crash in the browser.`,
    );
    process.exit(1);
  }
}

await cp(resolve(root, "public"), dist, { recursive: true });
console.log(`Studio built in ${dist}`);
