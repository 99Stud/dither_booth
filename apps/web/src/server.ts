import { WEB_SERVER_LOG_SOURCE } from "#lib/constants";
import { WEB_REPO_ROOT } from "#lib/server-constants";
import { getTrpcProxyUpstreamPath } from "#lib/trpc/trpc-proxy.utils";
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

import { getProxiedRequestHeaders, getSafeFileUrl } from "./server-utils";

const apiOrigin = getApiInternalOrigin();
const distDirectory = new URL("../dist/", import.meta.url);
const tlsCertPath = getWebTlsCertPath({ repoRoot: WEB_REPO_ROOT });
const tlsKeyPath = getWebTlsKeyPath({ repoRoot: WEB_REPO_ROOT });
const webOrigin = await getWebOrigin({ repoRoot: WEB_REPO_ROOT });
const indexHtmlUrl = new URL("index.html", distDirectory);

if (!existsSync(tlsCertPath) || !existsSync(tlsKeyPath)) {
  throw new Error(
    `Missing local TLS certificate. Run "bun run --filter @dither-booth/api cert:generate <LAN_IP>" to create ${tlsCertPath} and ${tlsKeyPath}.`,
  );
}

if (!(await fileExists(indexHtmlUrl))) {
  throw new Error(
    'Missing Vite build output. Run "bun run --filter @dither-booth/web build" before starting the production web server.',
  );
}

async function fileExists(fileUrl: URL) {
  return Bun.file(fileUrl).exists();
}

async function fileResponse(fileUrl: URL) {
  if (!(await fileExists(fileUrl))) {
    return undefined;
  }

  return new Response(Bun.file(fileUrl));
}

async function proxyApiRequest(req: Request) {
  const url = new URL(req.url);
  const upstreamUrl = new URL(
    getTrpcProxyUpstreamPath(`${url.pathname}${url.search}`),
    apiOrigin,
  );

  return fetch(upstreamUrl, {
    method: req.method,
    headers: getProxiedRequestHeaders(req.headers),
    body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
  });
}

async function serveViteAssetOrSpaShell(req: Request) {
  const url = new URL(req.url);

  if (url.pathname === "/") {
    return new Response(Bun.file(indexHtmlUrl));
  }

  try {
    const fileUrl = getSafeFileUrl(distDirectory, url.pathname.slice(1));
    const response = await fileResponse(fileUrl);

    return response ?? new Response(Bun.file(indexHtmlUrl));
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
  fetch(req) {
    const url = new URL(req.url);

    if (
      url.pathname === TRPC_PROXY_PATH ||
      url.pathname.startsWith(`${TRPC_PROXY_PATH}/`)
    ) {
      return proxyApiRequest(req);
    }

    return serveViteAssetOrSpaShell(req);
  },
});

logKioskEvent("info", WEB_SERVER_LOG_SOURCE, "server-started", {
  details: {
    environment: process.env.NODE_ENV,
    url: webOrigin,
  },
});
