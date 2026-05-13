import type {
  BrowserServerWebSocketData,
  RunBrowserServerOptions,
} from "#internal/browser-server.types";

import { runBrowserServer } from "#index";
import {
  IMMUTABLE_ASSET_CACHE_CONTROL,
  PUBLIC_ASSET_CACHE_CONTROL,
} from "#internal/browser-server.constants";
import {
  createWebSocketUpgradeRoute,
  createHealthzRoute,
  getProxiedRequestHeaders,
  getPublicAssetRoutes,
  getSafeFileUrl,
  getStaticRoutesFromManifests,
} from "#internal/browser-server.utils";
import { describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

function testTempRoot(): string {
  return Bun.env.TMPDIR ?? Bun.env.TEMP ?? "/tmp";
}

const distRoot = new URL("file:///tmp/dither-booth-browser-server-dist/");

const BunWebSocket = WebSocket as unknown as {
  new (
    url: string,
    options: {
      headers: Record<string, string>;
    },
  ): WebSocket;
};

describe("createHealthzRoute", () => {
  it("returns a 200 JSON response for GET requests", async () => {
    const route = createHealthzRoute({
      mode: "development",
      service: "web",
    });

    const res = await route(new Request("https://web.local/healthz"));
    const payload = (await res?.json()) as {
      ok: boolean;
      service: string;
      mode: string;
      timestamp: string;
    };

    expect(res?.status).toBe(200);
    expect(res?.headers.get("content-type")).toContain("application/json");
    expect(payload.ok).toBe(true);
    expect(payload.service).toBe("web");
    expect(payload.mode).toBe("development");
    expect(Number.isNaN(Date.parse(payload.timestamp))).toBe(false);
  });

  it("rejects non-GET requests", async () => {
    const route = createHealthzRoute({
      mode: "production",
      service: "admin",
    });

    const res = await route(
      new Request("https://admin.local/healthz", {
        method: "POST",
      }),
    );

    expect(res?.status).toBe(405);
    expect(res?.headers.get("allow")).toBe("GET");
  });
});

describe("createWebSocketUpgradeRoute", () => {
  function createUpgradeRoute(
    overrides: Partial<Parameters<typeof createWebSocketUpgradeRoute>[0]> = {},
  ) {
    return createWebSocketUpgradeRoute({
      handler: {},
      publicOrigin: "https://app.local",
      routePath: "/events",
      ...overrides,
    });
  }

  function createUpgradeRequest(origin = "https://app.local") {
    return new Request("https://app.local/events", {
      headers: {
        Origin: origin,
      },
    });
  }

  it("upgrades requests with route path data", async () => {
    const upgrades: unknown[] = [];
    const route = createUpgradeRoute();
    const server = {
      upgrade: (_req: Request, options: unknown) => {
        upgrades.push(options);
        return true;
      },
    } as unknown as Bun.Server<BrowserServerWebSocketData>;

    const response = await route(createUpgradeRequest(), server);

    expect(response).toBeUndefined();
    expect(upgrades).toEqual([
      {
        data: {
          routePath: "/events",
        },
      },
    ]);
  });

  it("rejects requests from a different origin", async () => {
    const route = createUpgradeRoute();
    const server = {
      upgrade: () => {
        throw new Error("should not upgrade");
      },
    } as unknown as Bun.Server<BrowserServerWebSocketData>;

    const response = await route(
      createUpgradeRequest("https://evil.local"),
      server,
    );

    expect(response?.status).toBe(403);
    await expect(response?.text()).resolves.toBe(
      "WebSocket origin not allowed.",
    );
  });

  it("rejects requests without an origin", async () => {
    const route = createUpgradeRoute();
    const server = {
      upgrade: () => {
        throw new Error("should not upgrade");
      },
    } as unknown as Bun.Server<BrowserServerWebSocketData>;

    const response = await route(
      new Request("https://app.local/events"),
      server,
    );

    expect(response?.status).toBe(403);
    await expect(response?.text()).resolves.toBe(
      "WebSocket origin not allowed.",
    );
  });

  it("allows route-level upgrade validation to reject requests", async () => {
    const route = createUpgradeRoute({
      handler: {
        validateUpgrade: () => new Response("Nope.", { status: 401 }),
      },
    });
    const server = {
      upgrade: () => {
        throw new Error("should not upgrade");
      },
    } as unknown as Bun.Server<BrowserServerWebSocketData>;

    const response = await route(createUpgradeRequest(), server);

    expect(response?.status).toBe(401);
    await expect(response?.text()).resolves.toBe("Nope.");
  });

  it("returns an error response when upgrade fails", async () => {
    const route = createUpgradeRoute();
    const server = {
      upgrade: () => false,
    } as unknown as Bun.Server<BrowserServerWebSocketData>;

    const response = await route(createUpgradeRequest(), server);

    expect(response?.status).toBe(500);
    await expect(response?.text()).resolves.toBe("WebSocket upgrade failed.");
  });

  it("accepts real same-origin WebSocket connections", async () => {
    const server = Bun.serve({
      port: 0,
      routes: {
        "/events": createUpgradeRoute(),
      },
      websocket: {
        data: {} as BrowserServerWebSocketData,
        message: () => undefined,
        open: (ws) => {
          ws.send(ws.data.routePath);
          ws.close(1000, "done");
        },
      },
    });

    try {
      const messages: string[] = [];
      const closeCode = await new Promise<number>((resolve, reject) => {
        const ws = new BunWebSocket(`ws://127.0.0.1:${server.port}/events`, {
          headers: {
            Origin: "https://app.local",
          },
        });

        ws.addEventListener("message", (event) => {
          messages.push(String(event.data));
        });
        ws.addEventListener("error", reject);
        ws.addEventListener("close", (event) => {
          resolve(event.code);
        });
      });

      expect(messages).toEqual(["/events"]);
      expect(closeCode).toBe(1000);
    } finally {
      server.stop();
    }
  });

  it("rejects cross-origin requests in a real server", async () => {
    const server = Bun.serve({
      port: 0,
      routes: {
        "/events": createUpgradeRoute(),
      },
      websocket: {
        data: {} as BrowserServerWebSocketData,
        message: () => undefined,
      },
    });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/events`, {
        headers: {
          Origin: "https://evil.local",
        },
      });

      expect(response.status).toBe(403);
      await expect(response.text()).resolves.toBe(
        "WebSocket origin not allowed.",
      );
    } finally {
      server.stop();
    }
  });
});

function createRunBrowserServerOptions(
  overrides: Partial<RunBrowserServerOptions>,
): RunBrowserServerOptions {
  return {
    apiOrigin: "https://api.local",
    appRoot: testTempRoot(),
    bindHost: "127.0.0.1",
    getTrpcProxyUpstreamPath: (path) => path,
    healthz: {
      service: "test",
    },
    indexHtml: {} as Bun.HTMLBundle,
    logStarted: () => undefined,
    mode: "development",
    port: 0,
    publicOrigin: "https://app.local",
    serverName: "testServer",
    tlsCertPath: "/missing/cert.pem",
    tlsKeyPath: "/missing/key.pem",
    trpcProxyPath: "/trpc",
    ...overrides,
  };
}

describe("runBrowserServer route validation", () => {
  it("rejects reserved websocket route paths before starting", async () => {
    await expect(
      runBrowserServer(
        createRunBrowserServerOptions({
          webSocketRoutes: {
            "/healthz": {},
          },
        }),
      ),
    ).rejects.toThrow('custom route cannot override reserved route "/healthz"');
  });

  it("rejects routes configured as both HTTP and websocket", async () => {
    await expect(
      runBrowserServer(
        createRunBrowserServerOptions({
          routes: {
            "/events": () => new Response("ok"),
          },
          webSocketRoutes: {
            "/events": {},
          },
        }),
      ),
    ).rejects.toThrow(
      'route "/events" cannot be both an HTTP and WebSocket route',
    );
  });
});

describe("getSafeFileUrl", () => {
  it("resolves asset paths inside the dist directory", () => {
    expect(getSafeFileUrl(distRoot, "assets/app.js")?.href).toBe(
      "file:///tmp/dither-booth-browser-server-dist/assets/app.js",
    );
  });

  it("rejects parent directory traversal", () => {
    expect(() => getSafeFileUrl(distRoot, "../secret.txt")).toThrow();
    expect(() => getSafeFileUrl(distRoot, "%2e%2e/secret.txt")).toThrow();
  });

  it("rejects backslash traversal before creating a file URL", () => {
    expect(() => getSafeFileUrl(distRoot, "..\\secret.txt")).toThrow();
    expect(() => getSafeFileUrl(distRoot, "%2e%2e%5Csecret.txt")).toThrow();
  });
});

describe("getStaticRoutesFromManifests", () => {
  it("merges path lists from multiple manifests under the given root", async () => {
    const base = join(
      testTempRoot(),
      `dither-booth-browser-manifest-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );

    try {
      await mkdir(join(base, "dist", "assets"), { recursive: true });
      await Bun.write(join(base, "dist", "assets", "app-abc12345.js"), "//");
      await Bun.write(join(base, "dist", "logo.svg"), "<svg/>");
      await Bun.write(
        join(base, "build.json"),
        JSON.stringify(["assets/app-abc12345.js"]),
      );
      await Bun.write(join(base, "public.json"), JSON.stringify(["logo.svg"]));

      const root = Bun.pathToFileURL(`${join(base, "dist")}/`);
      const routes = await getStaticRoutesFromManifests({
        root,
        manifests: [
          {
            cachePolicy: "immutable",
            url: Bun.pathToFileURL(join(base, "build.json")),
          },
          {
            cachePolicy: "public",
            url: Bun.pathToFileURL(join(base, "public.json")),
          },
        ],
      });

      expect(Object.keys(routes).sort()).toEqual([
        "/assets/app-abc12345.js",
        "/logo.svg",
      ]);

      const buildResponse = await routes["/assets/app-abc12345.js"]!(
        new Request("http://x"),
      );
      const publicResponse = await routes["/logo.svg"]!(
        new Request("http://x"),
      );

      expect(buildResponse?.headers.get("cache-control")).toBe(
        IMMUTABLE_ASSET_CACHE_CONTROL,
      );
      expect(publicResponse?.headers.get("cache-control")).toBe(
        PUBLIC_ASSET_CACHE_CONTROL,
      );
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("returns no routes when manifests are absent", async () => {
    const base = join(
      testTempRoot(),
      `dither-booth-browser-empty-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );

    try {
      await mkdir(join(base, "dist"), { recursive: true });
      const root = Bun.pathToFileURL(`${join(base, "dist")}/`);
      const routes = await getStaticRoutesFromManifests({
        root,
        manifests: [
          {
            cachePolicy: "public",
            url: Bun.pathToFileURL(join(base, "missing.json")),
          },
        ],
      });

      expect(Object.keys(routes)).toEqual([]);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

describe("getPublicAssetRoutes", () => {
  it("registers routes by globbing an existing public directory", async () => {
    const base = join(
      testTempRoot(),
      `dither-booth-browser-public-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );

    try {
      const publicRoot = join(base, "public");
      await mkdir(join(publicRoot, "ressources"), { recursive: true });
      await Bun.write(join(publicRoot, "ressources", "logo.svg"), "<svg/>");

      const routes = await getPublicAssetRoutes({
        publicDirectory: Bun.pathToFileURL(`${publicRoot}/`),
      });

      expect(Object.keys(routes).sort()).toEqual(["/ressources/logo.svg"]);
      const res = await routes["/ressources/logo.svg"]!(
        new Request("http://x"),
      );
      expect(res?.status).toBe(200);
      expect(res?.headers.get("cache-control")).toBe(
        PUBLIC_ASSET_CACHE_CONTROL,
      );
      expect(await res?.text()).toBe("<svg/>");
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("returns no routes when the public directory is absent", async () => {
    const base = join(
      testTempRoot(),
      `dither-booth-browser-missing-public-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );

    try {
      const routes = await getPublicAssetRoutes({
        publicDirectory: Bun.pathToFileURL(`${join(base, "public")}/`),
      });

      expect(Object.keys(routes)).toEqual([]);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("uses immutable cache for hashed public filenames", async () => {
    const base = join(
      testTempRoot(),
      `dither-booth-browser-hashed-public-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );

    try {
      const publicRoot = join(base, "public");
      await mkdir(join(publicRoot, "assets"), { recursive: true });
      await Bun.write(
        join(publicRoot, "assets", "logo-abc12345.svg"),
        "<svg/>",
      );

      const routes = await getPublicAssetRoutes({
        publicDirectory: Bun.pathToFileURL(`${publicRoot}/`),
      });

      const res = await routes["/assets/logo-abc12345.svg"]!(
        new Request("http://x"),
      );

      expect(res?.headers.get("cache-control")).toBe(
        IMMUTABLE_ASSET_CACHE_CONTROL,
      );
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

describe("getProxiedRequestHeaders", () => {
  it("drops spoofable proxy headers while preserving request metadata", () => {
    const headers = getProxiedRequestHeaders(
      new Headers({
        authorization: "Bearer token",
        connection: "upgrade",
        "content-type": "application/json",
        forwarded: "for=evil",
        host: "evil.example",
        "proxy-authorization": "secret",
        "x-forwarded-host": "evil.example",
      }),
    );

    expect(headers.get("authorization")).toBe("Bearer token");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.has("connection")).toBe(false);
    expect(headers.has("forwarded")).toBe(false);
    expect(headers.has("host")).toBe(false);
    expect(headers.has("proxy-authorization")).toBe(false);
    expect(headers.has("x-forwarded-host")).toBe(false);
  });
});
