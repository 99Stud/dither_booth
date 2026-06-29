import { runBrowserServer } from "@dither-booth/browser-server";
import { logKioskEvent } from "@dither-booth/logging";
import {
  WEB_BIND_HOST,
  getApiInternalOrigin,
  getPort,
  getWebOrigin,
  getWebTlsCertPath,
  getWebTlsKeyPath,
} from "@dither-booth/ports";
import { WEB_HEALTHZ_SERVICE } from "@dither-booth/shared/healthz";
import {
  TRPC_PROXY_PATH,
  getTrpcProxyUpstreamPath,
} from "@dither-booth/shared/trpc-proxy";

import { WEB_SERVER_LOG_SOURCE } from "#lib/constants";
import { WEB_APP_ROOT, WEB_REPO_ROOT } from "#lib/server-constants";
const apiOrigin = getApiInternalOrigin();

export async function runWebServer(options: {
  mode: "development" | "production";
  indexHtml: Bun.HTMLBundle;
}) {
  const tlsCertPath = getWebTlsCertPath({ repoRoot: WEB_REPO_ROOT });
  const tlsKeyPath = getWebTlsKeyPath({ repoRoot: WEB_REPO_ROOT });
  const webOrigin = await getWebOrigin({ repoRoot: WEB_REPO_ROOT });

  return await runBrowserServer({
    apiOrigin,
    appRoot: WEB_APP_ROOT,
    bindHost: WEB_BIND_HOST,
    getTrpcProxyUpstreamPath,
    healthz: {
      service: WEB_HEALTHZ_SERVICE,
    },
    indexHtml: options.indexHtml,
    logStarted: ({ details }) => {
      logKioskEvent("info", WEB_SERVER_LOG_SOURCE, "server-started", {
        details,
      });
    },
    mode: options.mode,
    port: getPort("WEB_PORT"),
    publicOrigin: webOrigin,
    serverName: "runWebServer",
    tlsCertPath,
    tlsKeyPath,
    trpcProxyPath: TRPC_PROXY_PATH,
  });
}
