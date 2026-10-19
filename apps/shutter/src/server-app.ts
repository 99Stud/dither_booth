import { runBrowserServer } from "@dither-booth/browser-server";
import { logKioskEvent } from "@dither-booth/logging";
import {
  BOOTH_WIFI_IP,
  SHUTTER_BIND_HOST,
  getAdminOrigin,
  getEngineInternalOrigin,
  getLocalOrigins,
  getPort,
  getSetupServerTokenPath,
  getShutterOrigin,
  getWebTlsCaPath,
  getWebTlsCertPath,
  getWebTlsHostnames,
  getWebTlsKeyPath,
} from "@dither-booth/ports";
import { DARKROOM_PATH } from "@dither-booth/shared/darkroom";
import { SHUTTER_HEALTHZ_SERVICE } from "@dither-booth/shared/healthz";
import {
  TRPC_PROXY_PATH,
  getTrpcProxyUpstreamPath,
} from "@dither-booth/shared/trpc-proxy";

import { SHUTTER_SERVER_LOG_SOURCE } from "#lib/constants";
import { createCaptiveBackend } from "#lib/device-setup/captive.backend";
import { runDeviceSetupServer } from "#lib/device-setup/device-setup.server";
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

  const shutterPort = getPort("SHUTTER_PORT");
  const repoPathOptions = { repoRoot: SHUTTER_REPO_ROOT };
  const deviceSetupServer = runDeviceSetupServer({
    adminOrigin: await getAdminOrigin(repoPathOptions),
    bindHost: SHUTTER_BIND_HOST,
    caPath: await getWebTlsCaPath(repoPathOptions),
    captive: createCaptiveBackend({
      engineOrigin,
      tokenPath: getSetupServerTokenPath(repoPathOptions),
    }),
    darkroomPath: DARKROOM_PATH,
    port: getPort("SETUP_PORT"),
    // `.local` first: it survives the booth getting a new IP at the next
    // venue. The booth Wi-Fi's address last: it's only there on that Wi-Fi.
    shutterOrigins: [
      ...(await getLocalOrigins(repoPathOptions, {
        port: shutterPort,
        protocol: "https",
      })),
      shutterOrigin,
      `https://${BOOTH_WIFI_IP}:${shutterPort}`,
    ],
  });

  const browserServer = await runBrowserServer({
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
    port: shutterPort,
    publicOrigin: shutterOrigin,
    serverName: "runShutterServer",
    tlsCertPath,
    tlsKeyPath,
    trpcProxyPath: TRPC_PROXY_PATH,
  });

  return {
    close: async () => {
      await Promise.all([browserServer.close(), deviceSetupServer.close()]);
    },
  };
}
