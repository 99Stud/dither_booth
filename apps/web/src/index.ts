import { logKioskEvent } from "@dither-booth/logging";
import { getPort } from "@dither-booth/ports";
import { serve } from "bun";
import { posix } from "node:path";

import { WEB_SERVER_LOG_SOURCE } from "./constants";
import index from "./index.html";
import { TRPC_PROXY_PATH } from "./lib/trpc/trpc.constants";

const manifestFile = Bun.file(new URL("./manifest.webmanifest", import.meta.url));
const kioskLogoFile = Bun.file(new URL("../assets/ditherbooth_logo.png", import.meta.url));

const apiOrigin = `http://127.0.0.1:${getPort("API_PORT")}`;
const publicDirectory = new URL("../public/", import.meta.url);
const PUBLIC_ROUTE_PREFIX = "/public/";

async function proxyApiRequest(req: Request) {
  const url = new URL(req.url);
  const upstreamPath = url.pathname.startsWith(`${TRPC_PROXY_PATH}/`)
    ? url.pathname.slice(TRPC_PROXY_PATH.length)
    : url.pathname === TRPC_PROXY_PATH
      ? "/"
      : url.pathname;
  const upstreamUrl = new URL(`${upstreamPath}${url.search}`, apiOrigin);

  return fetch(upstreamUrl, {
    method: req.method,
    headers: req.headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
  });
}

function servePublicFile(req: Request) {
  const url = new URL(req.url);
  const encodedPath = url.pathname.slice(PUBLIC_ROUTE_PREFIX.length);

  if (encodedPath.length === 0) {
    return new Response("Not Found", { status: 404 });
  }

  try {
    const relativePath = decodeURIComponent(encodedPath).replace(/^\/+/, "");
    const normalizedPath = posix.normalize(relativePath);

    // Prevent requests from escaping the public directory.
    if (normalizedPath === ".." || normalizedPath.startsWith("../")) {
      return new Response("Not Found", { status: 404 });
    }

    return new Response(Bun.file(new URL(normalizedPath, publicDirectory)));
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
}

const server = serve({
  hostname: process.env.MAKE_LOCALLY_ACCESSIBLE ? "0.0.0.0" : "localhost",
  port: getPort("WEB_PORT"),
  routes: {
    // Proxy API requests to the API server (Bypass CORS).
    [TRPC_PROXY_PATH]: proxyApiRequest,
    [`${TRPC_PROXY_PATH}/*`]: proxyApiRequest,
    "/manifest.webmanifest": () =>
      new Response(manifestFile, {
        headers: { "Content-Type": "application/manifest+json" },
      }),
    "/ditherbooth_logo.png": () =>
      new Response(kioskLogoFile, {
        headers: { "Content-Type": "image/png" },
      }),
    "/public/*": servePublicFile,
    "/*": index,
  },

  development: {
    // Enable browser hot reloading in development
    hmr: process.env.NODE_ENV !== "production",

    // Echo console logs from the browser to the server
    console: true,
  },
});

logKioskEvent("info", WEB_SERVER_LOG_SOURCE, "server-started", {
  details: {
    environment: process.env.NODE_ENV,
    url: server.url.toString(),
  },
});
