import { serve } from "bun";
import { resolve } from "node:path";

import type { RunBrowserServerOptions } from "./internal/browser-server.types";

import {
  BUILD_ASSET_MANIFEST_FILE_NAME,
  PUBLIC_ASSET_MANIFEST_FILE_NAME,
  PUBLIC_ASSET_CACHE_CONTROL,
} from "./internal/browser-server.constants";
import {
  getProxiedRequestHeaders,
  getPublicAssetRoutes,
  getStaticRoutesFromManifests,
} from "./internal/browser-server.utils";

export {
  IMMUTABLE_ASSET_CACHE_CONTROL,
  PUBLIC_ASSET_CACHE_CONTROL,
} from "./internal/browser-server.constants";
export type {
  BrowserServerMode,
  RunBrowserServerOptions,
} from "./internal/browser-server.types";
export {
  getProxiedRequestHeaders,
  getPublicAssetRoutes,
  getSafeFileUrl,
  getStaticRoutesFromManifests,
} from "./internal/browser-server.utils";

export async function runBrowserServer(options: RunBrowserServerOptions) {
  const isProduction = options.mode === "production";

  if (!isProduction && Bun.env.NODE_ENV === "production") {
    throw new Error(
      `${options.serverName}: development mode must not run with NODE_ENV=production`,
    );
  }

  if (options.indexHtml === undefined) {
    throw new Error(`${options.serverName}: indexHtml is required`);
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
          Bun.file(new URL("./dist/server-entry.html", appPackageUrl)),
          {
            headers: {
              "Cache-Control": PUBLIC_ASSET_CACHE_CONTROL,
            },
          },
        )
    : options.indexHtml;

  serve({
    hostname: options.bindHost,
    port: options.port,
    tls: {
      cert: Bun.file(options.tlsCertPath),
      key: Bun.file(options.tlsKeyPath),
    },
    routes: {
      [options.trpcProxyPath]: proxyApiRequest,
      [`${options.trpcProxyPath}/*`]: proxyApiRequest,
      ...staticRoutes,
      "/": spaFallback as never,
      "/*": spaFallback as never,
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
}
