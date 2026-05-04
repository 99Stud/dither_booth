export type RouteHandler = (req: Request) => Response | Promise<Response>;

export type BrowserServerMode = "development" | "production";

export type StaticAssetCachePolicy = "immutable" | "public";

export type StaticManifestConfig = {
  cachePolicy: StaticAssetCachePolicy;
  url: URL;
};

export type RunBrowserServerOptions = {
  apiOrigin: string;
  appRoot: string;
  bindHost: string;
  getTrpcProxyUpstreamPath: (path: string) => string;
  indexHtml: unknown;
  mode: BrowserServerMode;
  port: number;
  publicOrigin: string;
  serverName: string;
  tlsCertPath: string;
  tlsKeyPath: string;
  trpcProxyPath: string;
  logStarted: (event: {
    details: {
      environment: string | undefined;
      url: string;
    };
  }) => void;
};
