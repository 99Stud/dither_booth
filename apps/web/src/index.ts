import { getPort } from "@dither-booth/ports";
import { serve } from "bun";

import { logKioskEvent } from "./lib/logging";
import index from "./index.html";
import { TRPC_PROXY_PATH } from "./trpc/constants";

const apiOrigin = `http://127.0.0.1:${getPort("API_PORT")}`;
const trpcBasePath = "/api/trpc";

async function proxyApiRequest(req: Request) {
  const url = new URL(req.url);
  const upstreamPath = url.pathname.startsWith(`${trpcBasePath}/`)
    ? url.pathname.slice(trpcBasePath.length)
    : url.pathname === trpcBasePath
      ? "/"
      : url.pathname;
  const upstreamUrl = new URL(`${upstreamPath}${url.search}`, apiOrigin);

  return fetch(upstreamUrl, {
    method: req.method,
    headers: req.headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
  });
}

const server = serve({
  hostname: process.env.MAKE_LOCALLY_ACCESSIBLE ? "0.0.0.0" : "localhost",
  port: getPort("WEB_PORT"),
  routes: {
    [TRPC_PROXY_PATH]: proxyApiRequest,
    [`${TRPC_PROXY_PATH}/*`]: proxyApiRequest,
    // Serve index.html for all unmatched routes.
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

logKioskEvent("info", "web.server", "server-started", {
  environment: process.env.NODE_ENV,
  url: server.url,
});
