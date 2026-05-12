import { WEB_SERVER_LOG_SOURCE } from "#lib/constants";
import {
  WEB_APP_ROOT,
  WEB_REPO_ROOT,
  WEB_SERVER_HEALTHZ_SERVICE,
} from "#lib/server-constants";
import { getTrpcProxyUpstreamPath } from "#lib/trpc/trpc-proxy.utils";
import { TRPC_PROXY_PATH } from "#lib/trpc/trpc.constants";
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

const apiOrigin = getApiInternalOrigin();

export async function runWebServer(options: {
  mode: "development" | "production";
  indexHtml: Bun.HTMLBundle;
}) {
  const isProduction = options.mode === "production";

  if (!isProduction && Bun.env.NODE_ENV === "production") {
    throw new Error(
      "runWebServer: development mode must not run with NODE_ENV=production",
    );
  }

  const tlsCertPath = getWebTlsCertPath({ repoRoot: WEB_REPO_ROOT });
  const tlsKeyPath = getWebTlsKeyPath({ repoRoot: WEB_REPO_ROOT });
  const webOrigin = await getWebOrigin({ repoRoot: WEB_REPO_ROOT });

  return await runBrowserServer({
    apiOrigin,
    appRoot: WEB_APP_ROOT,
    bindHost: WEB_BIND_HOST,
    getTrpcProxyUpstreamPath,
    healthz: {
      service: WEB_SERVER_HEALTHZ_SERVICE,
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
