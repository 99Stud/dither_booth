import { logKioskEvent } from "@dither-booth/logging";
import { getPort } from "@dither-booth/ports";
import { serve } from "bun";

import { WEB_SERVER_LOG_SOURCE } from "./constants";
import index from "./index.html";
import { TRPC_PROXY_PATH } from "./lib/trpc/trpc.constants";

const apiOrigin = `http://127.0.0.1:${getPort("API_PORT")}`;

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

const server = serve({
  hostname: process.env.MAKE_LOCALLY_ACCESSIBLE ? "0.0.0.0" : "localhost",
  port: getPort("WEB_PORT"),
  routes: {
    [TRPC_PROXY_PATH]: proxyApiRequest,
    [`${TRPC_PROXY_PATH}/*`]: proxyApiRequest,
    // Serve index.html for all unmatched routes.
    "/*": index,
  },

  development: {
    // Enable browser hot reloading in development
    hmr: process.env.NODE_ENV !== "production" && true,

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
