import { runBrowserServer } from "@dither-booth/browser-server";
import { logKioskEvent } from "@dither-booth/logging";
import {
  ADMIN_BIND_HOST,
  getAdminOrigin,
  getEngineInternalOrigin,
  getPort,
  getWebTlsCertPath,
  getWebTlsHostnames,
  getWebTlsKeyPath,
} from "@dither-booth/ports";
import { PM2_LOG_RELATIVE_DIR } from "@dither-booth/shared/booth-system";
import { ADMIN_HEALTHZ_SERVICE } from "@dither-booth/shared/healthz";
import {
  TRPC_PROXY_PATH,
  getTrpcProxyUpstreamPath,
} from "@dither-booth/shared/trpc-proxy";
import { resolve } from "node:path";

import { ADMIN_SERVER_LOG_SOURCE } from "#lib/constants";
import { DOCS_DIST_RELATIVE_PATH } from "#lib/docs/docs.constants";
import { createDocsRoutes } from "#lib/docs/docs.routes";
import { LOGS_ROUTE_PATH } from "#lib/logs/logs.constants";
import { createLogHub } from "#lib/logs/logs.hub";
import { createJournalLogSource } from "#lib/logs/logs.journal";
import { createPm2LogSources, readPm2ProcessNames } from "#lib/logs/logs.pm2";
import { createLogsRoute } from "#lib/logs/logs.routes";
import { PM2_RESTART_ROUTE_PATH } from "#lib/pm2/pm2-control.constants";
import { createPm2RestartRoute } from "#lib/pm2/pm2-control.routes";
import { isPm2ManagedRuntime } from "#lib/pm2/pm2-control.utils";
import { ADMIN_APP_ROOT, ADMIN_REPO_ROOT } from "#lib/server-constants";
const engineOrigin = getEngineInternalOrigin();

export async function runAdminServer(options: {
  mode: "development" | "production";
  indexHtml: Bun.HTMLBundle;
}) {
  const isPm2Managed = isPm2ManagedRuntime();

  const tlsCertPath = getWebTlsCertPath({ repoRoot: ADMIN_REPO_ROOT });
  const tlsKeyPath = getWebTlsKeyPath({ repoRoot: ADMIN_REPO_ROOT });
  const adminOrigin = await getAdminOrigin({ repoRoot: ADMIN_REPO_ROOT });
  const allowedHostnames = await getWebTlsHostnames({
    repoRoot: ADMIN_REPO_ROOT,
  });

  return await runBrowserServer({
    allowedHostnames,
    engineOrigin,
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
    routes: createDocsRoutes(resolve(ADMIN_REPO_ROOT, DOCS_DIST_RELATIVE_PATH)),
    webSocketRoutes: {
      // Not only under PM2: without its files, each source reports unavailable.
      [LOGS_ROUTE_PATH]: createLogsRoute({
        hub: createLogHub({
          sources: [
            ...createPm2LogSources({
              logDir: resolve(ADMIN_REPO_ROOT, PM2_LOG_RELATIVE_DIR),
              processNames: await readPm2ProcessNames(ADMIN_REPO_ROOT),
            }),
            // Off the Pi (no journalctl), it reports unavailable.
            createJournalLogSource(),
          ],
        }),
      }),
      ...(isPm2Managed
        ? { [PM2_RESTART_ROUTE_PATH]: createPm2RestartRoute() }
        : {}),
    },
    serverName: "runAdminServer",
    tlsCertPath,
    tlsKeyPath,
    trpcProxyPath: TRPC_PROXY_PATH,
  });
}
