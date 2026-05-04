import {
  IMMUTABLE_ASSET_CACHE_CONTROL,
  PUBLIC_ASSET_CACHE_CONTROL,
} from "#internal/browser-server.constants";
import {
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

      expect(buildResponse.headers.get("cache-control")).toBe(
        IMMUTABLE_ASSET_CACHE_CONTROL,
      );
      expect(publicResponse.headers.get("cache-control")).toBe(
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
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe(PUBLIC_ASSET_CACHE_CONTROL);
      expect(await res.text()).toBe("<svg/>");
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

      expect(res.headers.get("cache-control")).toBe(
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
