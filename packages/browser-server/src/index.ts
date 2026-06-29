import { assertNonProductionNodeEnvForDevelopmentMode } from "@dither-booth/shared/server/runtime";
import { serve } from "bun";
import { resolve } from "node:path";

import type {
  BrowserServerWebSocketData,
  RunBrowserServerOptions,
} from "./internal/browser-server.types";

import {
  BUILD_ASSET_MANIFEST_FILE_NAME,
  PUBLIC_ASSET_MANIFEST_FILE_NAME,
  PUBLIC_ASSET_CACHE_CONTROL,
  PRODUCTION_SERVER_HTML_FILE_NAME,
} from "./internal/browser-server.constants";
import {
  createHealthzRoute,
  createWebSocketUpgradeRoute,
  getProxiedRequestHeaders,
  getPublicAssetRoutes,
  getStaticRoutesFromManifests,
} from "./internal/browser-server.utils";

export async function runBrowserServer(options: RunBrowserServerOptions) {
  const isProduction = options.mode === "production";

  assertNonProductionNodeEnvForDevelopmentMode({
    mode: options.mode,
    serverName: options.serverName,
  });

  const reservedRoutePaths = new Set([
    options.trpcProxyPath,
    `${options.trpcProxyPath}/*`,
    "/healthz",
    "/",
    "/*",
  ]);
  const customRoutes = options.routes ?? {};
  const webSocketRoutes = options.webSocketRoutes ?? {};

  for (const routePath of [
    ...Object.keys(customRoutes),
    ...Object.keys(webSocketRoutes),
  ]) {
    if (reservedRoutePaths.has(routePath)) {
      throw new Error(
        `${options.serverName}: custom route cannot override reserved route "${routePath}".`,
      );
    }
  }

  for (const routePath of Object.keys(webSocketRoutes)) {
    if (routePath in customRoutes) {
      throw new Error(
        `${options.serverName}: route "${routePath}" cannot be both an HTTP and WebSocket route.`,
      );
    }
  }

  const appPackageUrl = Bun.pathToFileURL(`${options.appRoot}/`);
  const publicDirectory = new URL("./public/", appPackageUrl);

  const staticRoutes = isProduction
    ? await getStaticRoutesFromManifests({
        root: Bun.pathToFileURL(`${resolve(options.appRoot, "dist")}/`),
        manifests: [
          {
            cachePolicy: "immutable",
            url: new URL(
              `./dist/${BUILD_ASSET_MANIFEST_FILE_NAME}`,
              appPackageUrl,
            ),
          },
          {
            cachePolicy: "public",
            url: new URL(
              `./dist/${PUBLIC_ASSET_MANIFEST_FILE_NAME}`,
              appPackageUrl,
            ),
          },
        ],
      })
    : await getPublicAssetRoutes({
        publicDirectory,
        manifestUrl: undefined,
      });

  const hasTlsCert = await Bun.file(options.tlsCertPath).exists();
  const hasTlsKey = await Bun.file(options.tlsKeyPath).exists();

  if (!hasTlsCert || !hasTlsKey) {
    throw new Error(
      `Missing local TLS certificate. Run "bun run --filter @dither-booth/api cert:generate <LAN_IP>" to create ${options.tlsCertPath} and ${options.tlsKeyPath}.`,
    );
  }

  async function proxyApiRequest(req: Request) {
    const url = new URL(req.url);
    const upstreamUrl = new URL(
      options.getTrpcProxyUpstreamPath(`${url.pathname}${url.search}`),
      options.apiOrigin,
    );

    return fetch(upstreamUrl, {
      method: req.method,
      headers: getProxiedRequestHeaders(req.headers),
      body:
        req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
    });
  }

  const spaFallback = isProduction
    ? () =>
        new Response(
          Bun.file(
            new URL(
              `./dist/${PRODUCTION_SERVER_HTML_FILE_NAME}`,
              appPackageUrl,
            ),
          ),
          {
            headers: {
              "Cache-Control": PUBLIC_ASSET_CACHE_CONTROL,
            },
          },
        )
    : options.indexHtml;
  const healthzRoute = createHealthzRoute({
    mode: options.mode,
    service: options.healthz.service,
  });
  const webSocketUpgradeRoutes = Object.fromEntries(
    Object.entries(webSocketRoutes).map(([routePath, handler]) => [
      routePath,
      createWebSocketUpgradeRoute({
        handler,
        publicOrigin: options.publicOrigin,
        routePath,
      }),
    ]),
  );

  const server = serve({
    hostname: options.bindHost,
    port: options.port,
    tls: {
      cert: Bun.file(options.tlsCertPath),
      key: Bun.file(options.tlsKeyPath),
    },
    routes: {
      [options.trpcProxyPath]: proxyApiRequest,
      [`${options.trpcProxyPath}/*`]: proxyApiRequest,
      ...customRoutes,
      ...webSocketUpgradeRoutes,
      ...staticRoutes,
      "/healthz": healthzRoute,
      "/": spaFallback,
      "/*": spaFallback,
    },
    websocket: {
      data: {} as BrowserServerWebSocketData,
      open: (ws) => {
        void webSocketRoutes[ws.data.routePath]?.open?.(ws);
      },
      message: (ws, message) => {
        void webSocketRoutes[ws.data.routePath]?.message?.(ws, message);
      },
      close: (ws, code, reason) => {
        void webSocketRoutes[ws.data.routePath]?.close?.(ws, code, reason);
      },
    },
    development: isProduction
      ? false
      : {
          hmr: true,
          console: true,
        },
  });

  options.logStarted({
    details: {
      environment: Bun.env.NODE_ENV,
      url: options.publicOrigin,
    },
  });

  return {
    close: () => server.stop(),
  };
}
