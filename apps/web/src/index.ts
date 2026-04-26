import { WEB_SERVER_LOG_SOURCE } from "#lib/constants";
import { WEB_REPO_ROOT } from "#lib/server-constants";
import { TRPC_PROXY_PATH } from "#lib/trpc/trpc.constants";
import { logKioskEvent } from "@dither-booth/logging";
import {
  getApiInternalOrigin,
  getPort,
  getWebBindHost,
  getWebOrigin,
  getWebTlsCertPath,
  getWebTlsKeyPath,
} from "@dither-booth/ports";
import { serve } from "bun";
import { existsSync } from "node:fs";
import { posix } from "node:path";

import index from "./index.html";

const apiOrigin = getApiInternalOrigin();
const publicDirectory = new URL("../public/", import.meta.url);
const PUBLIC_ROUTE_PREFIX = "/public/";
const tlsCertPath = getWebTlsCertPath({ repoRoot: WEB_REPO_ROOT });
const tlsKeyPath = getWebTlsKeyPath({ repoRoot: WEB_REPO_ROOT });
const webOrigin = getWebOrigin({ repoRoot: WEB_REPO_ROOT });

if (!existsSync(tlsCertPath) || !existsSync(tlsKeyPath)) {
  throw new Error(
    `Missing local TLS certificate. Run "bun run --filter @dither-booth/api cert:generate <LAN_IP>" to create ${tlsCertPath} and ${tlsKeyPath}.`,
  );
}

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

serve({
  hostname: getWebBindHost(),
  port: getPort("WEB_PORT"),
  tls: {
    cert: Bun.file(tlsCertPath),
    key: Bun.file(tlsKeyPath),
  },
  routes: {
    // Proxy API requests to the API server (Bypass CORS).
    [TRPC_PROXY_PATH]: proxyApiRequest,
    [`${TRPC_PROXY_PATH}/*`]: proxyApiRequest,
    // Serve static public files.
    "/public/*": servePublicFile,
    // Serve index.html for all unmatched routes (React SPA).
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
    url: webOrigin,
  },
});
