import { runBrowserServer } from "@dither-booth/browser-server";
import { logKioskEvent } from "@dither-booth/logging";
import { SERVER_STARTED_EVENT } from "@dither-booth/logging/kiosk-line";
import {
  ADMIN_BIND_HOST,
  getAdminOrigin,
  getEngineInternalOrigin,
  getPort,
  getWebTlsCertPath,
  getWebTlsHostnames,
  getWebTlsKeyPath,
} from "@dither-booth/ports";
import { isAllowedConfiguredOrigin } from "@dither-booth/ports/origin";
import {
  PM2_LOG_RELATIVE_DIR,
  PM2_PROCESS_NAMES,
} from "@dither-booth/shared/booth-system";
import { ADMIN_HEALTHZ_SERVICE } from "@dither-booth/shared/healthz";
import { readRelease } from "@dither-booth/shared/server/release";
import { hostSystemctlRun } from "@dither-booth/shared/server/systemctl";
import {
  TRPC_PROXY_PATH,
  getTrpcProxyUpstreamPath,
} from "@dither-booth/shared/trpc-proxy";
import { dirname, resolve } from "node:path";

import { ADMIN_SERVER_LOG_SOURCE } from "#lib/constants";
import { DOCS_DIST_RELATIVE_PATH } from "#lib/docs/docs.constants";
import { createDocsRoutes } from "#lib/docs/docs.routes";
import { LOGS_ROUTE_PATH } from "#lib/logs/logs.constants";
import { createLogHub } from "#lib/logs/logs.hub";
import { createJournalLogSource } from "#lib/logs/logs.journal";
import { createPm2LogSources } from "#lib/logs/logs.pm2";
import { createLogsRoute } from "#lib/logs/logs.routes";
import { PM2_RESTART_ROUTE_PATH } from "#lib/pm2/pm2-control.constants";
import { createPm2RestartRoute } from "#lib/pm2/pm2-control.routes";
import { isPm2ManagedRuntime } from "#lib/pm2/pm2-control.utils";
import { POWER_ROUTE_PATH } from "#lib/power/power.constants";
import { createPowerRoute } from "#lib/power/power.routes";
import { runPowerAction } from "#lib/power/power.server";
import { ADMIN_APP_ROOT, ADMIN_REPO_ROOT } from "#lib/server-constants";
import { STAFF_SESSION_ROUTE_PATH } from "#lib/staff-session/staff-session.constants";
import { createStaffSessionEngine } from "#lib/staff-session/staff-session.engine";
import { createStaffSession } from "#lib/staff-session/staff-session.routes";
import { SYSTEM_ROUTE_PATH } from "#lib/system/system.constants";
import { hostSystemReaderDeps } from "#lib/system/system.host";
import { createSystemReader } from "#lib/system/system.reader";
import { createSystemRoute } from "#lib/system/system.routes";
import { createSystemSampler } from "#lib/system/system.sampler";
import { createReleaseChecker } from "#lib/update/update.checker";
import { UPDATE_ROUTE_PATH } from "#lib/update/update.constants";
import { createHostUpdateDeps } from "#lib/update/update.host";
import { createUpdateRoute } from "#lib/update/update.routes";
const engineOrigin = getEngineInternalOrigin();

export async function runAdminServer(options: {
  mode: "development" | "production";
  indexHtml: Bun.HTMLBundle;
}) {
  const isPm2Managed = isPm2ManagedRuntime();
  const release = readRelease(ADMIN_REPO_ROOT);

  const tlsCertPath = getWebTlsCertPath({ repoRoot: ADMIN_REPO_ROOT });
  const tlsKeyPath = getWebTlsKeyPath({ repoRoot: ADMIN_REPO_ROOT });
  const adminOrigin = await getAdminOrigin({ repoRoot: ADMIN_REPO_ROOT });
  const allowedHostnames = await getWebTlsHostnames({
    repoRoot: ADMIN_REPO_ROOT,
  });
  // The action routes' check: a POST comes from this admin, not another site.
  const isAdminOrigin = (origin: string | undefined) =>
    isAllowedConfiguredOrigin(origin, adminOrigin, allowedHostnames);
  // Every admin route below, and every engine call, needs the staff PIN.
  // The docs, `/healthz` and the page itself stay open, for the PIN screen.
  const staffSession = createStaffSession({
    engine: createStaffSessionEngine(engineOrigin),
    isAllowedOrigin: isAdminOrigin,
  });

  return await runBrowserServer({
    allowedHostnames,
    engineOrigin,
    appRoot: ADMIN_APP_ROOT,
    bindHost: ADMIN_BIND_HOST,
    getTrpcProxyUpstreamPath,
    healthz: {
      service: ADMIN_HEALTHZ_SERVICE,
      release,
    },
    indexHtml: options.indexHtml,
    logStarted: ({ details }) => {
      logKioskEvent("info", ADMIN_SERVER_LOG_SOURCE, SERVER_STARTED_EVENT, {
        details,
      });
    },
    mode: options.mode,
    port: getPort("ADMIN_PORT"),
    proxyHeaders: staffSession.proxyHeaders,
    publicOrigin: adminOrigin,
    routes: {
      ...createDocsRoutes(resolve(ADMIN_REPO_ROOT, DOCS_DIST_RELATIVE_PATH)),
      [STAFF_SESSION_ROUTE_PATH]: staffSession.route,
      // Off the Pi, its own readings (heat, fan, throttling) report
      // unavailable; memory, CPU and the root disk still work.
      [SYSTEM_ROUTE_PATH]: staffSession.guard(
        createSystemRoute(
          createSystemSampler({
            reader: createSystemReader(hostSystemReaderDeps),
            onError: (error) => {
              logKioskEvent(
                "warn",
                ADMIN_SERVER_LOG_SOURCE,
                "system-read-failed",
                {
                  details: {
                    message:
                      error instanceof Error ? error.message : String(error),
                  },
                },
              );
            },
          }),
        ),
      ),
      // Only on the booth: elsewhere these would restart or reboot the
      // developer's machine.
      ...(isPm2Managed
        ? {
            [POWER_ROUTE_PATH]: staffSession.guard(
              createPowerRoute({
                isAllowedOrigin: isAdminOrigin,
                runAction: (action) => runPowerAction(action, hostSystemctlRun),
              }),
            ),
            [UPDATE_ROUTE_PATH]: staffSession.guard(
              createUpdateRoute({
                release,
                checker: createReleaseChecker(),
                isAllowedOrigin: isAdminOrigin,
                ...createHostUpdateDeps({
                  repoRoot: ADMIN_REPO_ROOT,
                  releasesParent: dirname(ADMIN_REPO_ROOT),
                  run: hostSystemctlRun,
                }),
              }),
            ),
          }
        : {}),
    },
    webSocketRoutes: {
      // Not only under PM2: without its files, each source reports unavailable.
      [LOGS_ROUTE_PATH]: {
        ...createLogsRoute({
          hub: createLogHub({
            sources: [
              ...createPm2LogSources({
                logDir: resolve(ADMIN_REPO_ROOT, PM2_LOG_RELATIVE_DIR),
                processNames: PM2_PROCESS_NAMES,
              }),
              // Off the Pi (no journalctl), it reports unavailable.
              createJournalLogSource(),
            ],
          }),
        }),
        validateUpgrade: staffSession.validateUpgrade,
      },
      ...(isPm2Managed
        ? {
            [PM2_RESTART_ROUTE_PATH]: {
              ...createPm2RestartRoute(),
              validateUpgrade: staffSession.validateUpgrade,
            },
          }
        : {}),
    },
    serverName: "runAdminServer",
    tlsCertPath,
    tlsKeyPath,
    trpcProxyPath: TRPC_PROXY_PATH,
  });
}
