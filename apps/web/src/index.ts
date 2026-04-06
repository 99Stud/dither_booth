import { getPort } from "@dither-booth/ports";
import { serve } from "bun";

import { TRPC_BASE_PATH } from "../constants";
import { WEB_SERVER_LOG_SOURCE } from "./index.constants";
import index from "./index.html";
import { logKioskEvent } from "./lib/logging";
import { TRPC_PROXY_PATH } from "./trpc/constants";

const apiOrigin = `http://127.0.0.1:${getPort("API_PORT")}`;

async function proxyApiRequest(req: Request) {
  const url = new URL(req.url);
  const upstreamPath = url.pathname.startsWith(`${TRPC_BASE_PATH}/`)
    ? url.pathname.slice(TRPC_BASE_PATH.length)
    : url.pathname === TRPC_BASE_PATH
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

logKioskEvent("info", WEB_SERVER_LOG_SOURCE, "server-started", {
  environment: process.env.NODE_ENV,
  url: server.url.toString(),
});
