import { WEB_SERVER_LOG_SOURCE } from "#lib/constants";
import { WEB_APP_ROOT, WEB_REPO_ROOT } from "#lib/server-constants";
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
  /** Bun `import index from "./index.html"` value. */
  indexHtml: unknown;
}) {
  const isProduction = options.mode === "production";

  if (!isProduction && Bun.env.NODE_ENV === "production") {
    throw new Error(
      "runWebServer: development mode must not run with NODE_ENV=production",
    );
  }

  if (options.indexHtml === undefined) {
    throw new Error("runWebServer: indexHtml is required");
  }

  const tlsCertPath = getWebTlsCertPath({ repoRoot: WEB_REPO_ROOT });
  const tlsKeyPath = getWebTlsKeyPath({ repoRoot: WEB_REPO_ROOT });
  const webOrigin = await getWebOrigin({ repoRoot: WEB_REPO_ROOT });

  await runBrowserServer({
    apiOrigin,
    appRoot: WEB_APP_ROOT,
    bindHost: WEB_BIND_HOST,
    getTrpcProxyUpstreamPath,
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
