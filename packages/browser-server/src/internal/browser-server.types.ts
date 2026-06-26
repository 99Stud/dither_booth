import type { HealthzMode, HealthzPayload } from "@dither-booth/shared/healthz";

export type RouteHandler = (
  req: Request,
  server?: Bun.Server<BrowserServerWebSocketData>,
) => Response | undefined | Promise<Response | undefined>;

export type BrowserServerWebSocketData = {
  routePath: string;
};

export type BrowserServerWebSocket =
  Bun.ServerWebSocket<BrowserServerWebSocketData>;

export type BrowserServerWebSocketMessage = string | Buffer;

export type WebSocketUpgradeValidator = (
  req: Request,
) => Response | undefined | Promise<Response | undefined>;

export type WebSocketRouteHandler = {
  validateUpgrade?: WebSocketUpgradeValidator;
  open?: (ws: BrowserServerWebSocket) => void | Promise<void>;
  message?: (
    ws: BrowserServerWebSocket,
    message: BrowserServerWebSocketMessage,
  ) => void | Promise<void>;
  close?: (
    ws: BrowserServerWebSocket,
    code: number,
    reason: string,
  ) => void | Promise<void>;
};

export type BrowserServerMode = HealthzMode;

export type StaticAssetCachePolicy = "immutable" | "public";

export type BrowserServerHealthzConfig = {
  service: string;
};

export type BrowserServerHealthzPayload = HealthzPayload<string>;

export type BrowserServerLifecycle = {
  close: () => Promise<void>;
};

export type StaticManifestConfig = {
  cachePolicy: StaticAssetCachePolicy;
  url: URL;
};

export type RunBrowserServerOptions = {
  apiOrigin: string;
  appRoot: string;
  bindHost: string;
  getTrpcProxyUpstreamPath: (path: string) => string;
  healthz: BrowserServerHealthzConfig;
  indexHtml: Bun.HTMLBundle;
  mode: BrowserServerMode;
  port: number;
  publicOrigin: string;
  routes?: Record<string, RouteHandler>;
  serverName: string;
  tlsCertPath: string;
  tlsKeyPath: string;
  trpcProxyPath: string;
  webSocketRoutes?: Record<string, WebSocketRouteHandler>;
  logStarted: (event: {
    details: {
      environment: string | undefined;
      url: string;
    };
  }) => void;
};
