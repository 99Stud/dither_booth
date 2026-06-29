import { runBrowserServer } from "@dither-booth/browser-server";
import { logKioskEvent } from "@dither-booth/logging";
import {
  ADMIN_BIND_HOST,
  getAdminOrigin,
  getApiInternalOrigin,
  getPort,
  getWebTlsCertPath,
  getWebTlsKeyPath,
} from "@dither-booth/ports";
import { ADMIN_HEALTHZ_SERVICE } from "@dither-booth/shared/healthz";
import {
  TRPC_PROXY_PATH,
  getTrpcProxyUpstreamPath,
} from "@dither-booth/shared/trpc-proxy";

import { ADMIN_SERVER_LOG_SOURCE } from "#lib/constants";
import { PM2_RESTART_ROUTE_PATH } from "#lib/pm2/pm2-control.constants";
import { createPm2RestartRoute } from "#lib/pm2/pm2-control.routes";
import { isPm2ManagedRuntime } from "#lib/pm2/pm2-control.utils";
import { ADMIN_APP_ROOT, ADMIN_REPO_ROOT } from "#lib/server-constants";
const apiOrigin = getApiInternalOrigin();

export async function runAdminServer(options: {
  mode: "development" | "production";
  indexHtml: Bun.HTMLBundle;
}) {
  const isPm2Managed = isPm2ManagedRuntime();

  const tlsCertPath = getWebTlsCertPath({ repoRoot: ADMIN_REPO_ROOT });
  const tlsKeyPath = getWebTlsKeyPath({ repoRoot: ADMIN_REPO_ROOT });
  const adminOrigin = await getAdminOrigin({ repoRoot: ADMIN_REPO_ROOT });

  return await runBrowserServer({
    apiOrigin,
    appRoot: ADMIN_APP_ROOT,
    bindHost: ADMIN_BIND_HOST,
    getTrpcProxyUpstreamPath,
    healthz: {
      service: ADMIN_HEALTHZ_SERVICE,
    },
    indexHtml: options.indexHtml,
    logStarted: ({ details }) => {
      logKioskEvent("info", ADMIN_SERVER_LOG_SOURCE, "server-started", {
        details,
      });
    },
    mode: options.mode,
    port: getPort("ADMIN_PORT"),
    publicOrigin: adminOrigin,
    webSocketRoutes: isPm2Managed
      ? {
          [PM2_RESTART_ROUTE_PATH]: createPm2RestartRoute(),
        }
      : undefined,
    serverName: "runAdminServer",
    tlsCertPath,
    tlsKeyPath,
    trpcProxyPath: TRPC_PROXY_PATH,
  });
}
