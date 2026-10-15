import { runBrowserServer } from "@dither-booth/browser-server";
import { logKioskEvent } from "@dither-booth/logging";
import {
  SHUTTER_BIND_HOST,
  getEngineInternalOrigin,
  getPort,
  getShutterOrigin,
  getWebTlsCertPath,
  getWebTlsHostnames,
  getWebTlsKeyPath,
} from "@dither-booth/ports";
import { SHUTTER_HEALTHZ_SERVICE } from "@dither-booth/shared/healthz";
import {
  TRPC_PROXY_PATH,
  getTrpcProxyUpstreamPath,
} from "@dither-booth/shared/trpc-proxy";

import { SHUTTER_SERVER_LOG_SOURCE } from "#lib/constants";
import { SHUTTER_APP_ROOT, SHUTTER_REPO_ROOT } from "#lib/server-constants";
const engineOrigin = getEngineInternalOrigin();

export async function runShutterServer(options: {
  mode: "development" | "production";
  indexHtml: Bun.HTMLBundle;
}) {
  const tlsCertPath = getWebTlsCertPath({ repoRoot: SHUTTER_REPO_ROOT });
  const tlsKeyPath = getWebTlsKeyPath({ repoRoot: SHUTTER_REPO_ROOT });
  const shutterOrigin = await getShutterOrigin({ repoRoot: SHUTTER_REPO_ROOT });
  const allowedHostnames = await getWebTlsHostnames({
    repoRoot: SHUTTER_REPO_ROOT,
  });

  return await runBrowserServer({
    allowedHostnames,
    engineOrigin,
    appRoot: SHUTTER_APP_ROOT,
    bindHost: SHUTTER_BIND_HOST,
    getTrpcProxyUpstreamPath,
    healthz: {
      service: SHUTTER_HEALTHZ_SERVICE,
    },
    indexHtml: options.indexHtml,
    logStarted: ({ details }) => {
      logKioskEvent("info", SHUTTER_SERVER_LOG_SOURCE, "server-started", {
        details,
      });
    },
    mode: options.mode,
    port: getPort("SHUTTER_PORT"),
    publicOrigin: shutterOrigin,
    serverName: "runShutterServer",
    tlsCertPath,
    tlsKeyPath,
    trpcProxyPath: TRPC_PROXY_PATH,
  });
}
