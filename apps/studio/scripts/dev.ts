// Studio on http://localhost:5180 with hot reload. localhost counts as a
// secure origin, so the service worker and push work here too (in Chrome or
// Firefox; Safari only pushes to a Home Screen app).
import { resolve } from "node:path";

import index from "../src/index.html";

const root = resolve(import.meta.dir, "..");

async function serviceWorker() {
  const result = await Bun.build({
    entrypoints: [resolve(root, "src/sw/sw.ts")],
    target: "browser",
  });
  const [output] = result.outputs;
  return output
    ? new Response(await output.text(), {
        headers: {
          "Content-Type": "text/javascript",
          "Cache-Control": "no-store",
        },
      })
    : new Response("service worker build failed", { status: 500 });
}

const server = Bun.serve({
  port: 5180,
  development: { hmr: true, console: true },
  routes: {
    "/sw.js": serviceWorker,
    "/manifest.webmanifest": Bun.file(
      resolve(root, "public/manifest.webmanifest"),
    ),
    "/icons/:name": (req) =>
      new Response(Bun.file(resolve(root, "public/icons", req.params.name))),
    "/*": index,
  },
});
console.log(`Studio on ${server.url}`);
