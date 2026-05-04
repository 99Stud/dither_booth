import { ADMIN_SERVER_LOG_SOURCE } from "#lib/constants";
import { ADMIN_APP_ROOT, ADMIN_REPO_ROOT } from "#lib/server-constants";
import { getTrpcProxyUpstreamPath } from "#lib/trpc/trpc-proxy.utils";
import { TRPC_PROXY_PATH } from "#lib/trpc/trpc.constants";
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

const apiOrigin = getApiInternalOrigin();

export async function runAdminServer(options: {
  mode: "development" | "production";
  /** Bun `import index from "./index.html"` value. */
  indexHtml: unknown;
}) {
  const isProduction = options.mode === "production";

  if (!isProduction && Bun.env.NODE_ENV === "production") {
    throw new Error(
      "runAdminServer: development mode must not run with NODE_ENV=production",
    );
  }

  if (options.indexHtml === undefined) {
    throw new Error("runAdminServer: indexHtml is required");
  }

  const tlsCertPath = getWebTlsCertPath({ repoRoot: ADMIN_REPO_ROOT });
  const tlsKeyPath = getWebTlsKeyPath({ repoRoot: ADMIN_REPO_ROOT });
  const adminOrigin = await getAdminOrigin({ repoRoot: ADMIN_REPO_ROOT });

  await runBrowserServer({
    apiOrigin,
    appRoot: ADMIN_APP_ROOT,
    bindHost: ADMIN_BIND_HOST,
    getTrpcProxyUpstreamPath,
    indexHtml: options.indexHtml,
    logStarted: ({ details }) => {
      logKioskEvent("info", ADMIN_SERVER_LOG_SOURCE, "server-started", {
        details,
      });
    },
    mode: options.mode,
    port: getPort("ADMIN_PORT"),
    publicOrigin: adminOrigin,
    serverName: "runAdminServer",
    tlsCertPath,
    tlsKeyPath,
    trpcProxyPath: TRPC_PROXY_PATH,
  });
}
