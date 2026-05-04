import { isAbsolute, relative, resolve, sep } from "node:path";

import type {
  RouteHandler,
  StaticAssetCachePolicy,
  StaticManifestConfig,
} from "./browser-server.types";

import {
  BLOCKED_PROXY_HEADERS,
  HASHED_FILE_PATTERN,
  IMMUTABLE_ASSET_CACHE_CONTROL,
  PUBLIC_ASSET_CACHE_CONTROL,
} from "./browser-server.constants";

function rejectUnsafePath(): never {
  throw new Error("Unsafe static file path.");
}

function getCacheControlHeader(
  path: string,
  cachePolicy: StaticAssetCachePolicy,
) {
  if (cachePolicy === "immutable" || HASHED_FILE_PATTERN.test(path)) {
    return IMMUTABLE_ASSET_CACHE_CONTROL;
  }

  return PUBLIC_ASSET_CACHE_CONTROL;
}

export function getSafeFileUrl(root: URL, encodedPath: string) {
  const decodedPath = decodeURIComponent(encodedPath);

  if (
    decodedPath.length === 0 ||
    decodedPath.includes("\\") ||
    decodedPath.includes("\0") ||
    isAbsolute(decodedPath)
  ) {
    rejectUnsafePath();
  }

  const rootPath = Bun.fileURLToPath(root);
  const filePath = resolve(rootPath, decodedPath);
  const pathFromRoot = relative(rootPath, filePath);

  if (
    pathFromRoot.length === 0 ||
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    rejectUnsafePath();
  }

  return Bun.pathToFileURL(filePath);
}

export function getProxiedRequestHeaders(headers: Headers) {
  const proxiedHeaders = new Headers();

  headers.forEach((value, name) => {
    const headerName = name.toLowerCase();

    if (
      BLOCKED_PROXY_HEADERS.has(headerName) ||
      headerName.startsWith("proxy-") ||
      headerName.startsWith("x-forwarded-")
    ) {
      return;
    }

    proxiedHeaders.append(name, value);
  });

  return proxiedHeaders;
}

async function readStringListManifest(manifestUrl: URL): Promise<string[]> {
  if (!(await Bun.file(manifestUrl).exists())) {
    return [];
  }

  const manifest = await Bun.file(manifestUrl).json();

  if (!Array.isArray(manifest)) {
    return [];
  }

  return manifest.filter((path): path is string => typeof path === "string");
}

/** Production static files: only paths listed in manifests, resolved under `root`. */
export async function getStaticRoutesFromManifests({
  root,
  manifests,
}: {
  root: URL;
  manifests: StaticManifestConfig[];
}): Promise<Record<string, RouteHandler>> {
  const routes: Record<string, RouteHandler> = {};

  for (const manifest of manifests) {
    for (const staticPath of await readStringListManifest(manifest.url)) {
      routes[`/${staticPath}`] = () =>
        new Response(Bun.file(getSafeFileUrl(root, staticPath)), {
          headers: {
            "Cache-Control": getCacheControlHeader(
              staticPath,
              manifest.cachePolicy,
            ),
          },
        });
    }
  }

  return routes;
}

async function isExistingDirectory(path: string): Promise<boolean> {
  try {
    return (await Bun.file(path).stat()).isDirectory();
  } catch {
    return false;
  }
}

async function getPublicAssetPaths(publicDirectory: URL, manifestUrl?: URL) {
  if (manifestUrl && (await Bun.file(manifestUrl).exists())) {
    const manifest = await Bun.file(manifestUrl).json();

    if (Array.isArray(manifest)) {
      return manifest.filter(
        (path): path is string => typeof path === "string",
      );
    }
  }

  const publicDirectoryPath = Bun.fileURLToPath(publicDirectory);

  if (!(await isExistingDirectory(publicDirectoryPath))) {
    return [];
  }

  const paths: string[] = [];

  for await (const path of new Bun.Glob("**/*").scan({
    cwd: publicDirectoryPath,
    onlyFiles: true,
  })) {
    paths.push(path.split(sep).join("/"));
  }

  return paths;
}

/** Development: files under `public/` (glob or optional manifest). */
export async function getPublicAssetRoutes({
  publicDirectory,
  manifestUrl,
}: {
  publicDirectory: URL;
  manifestUrl?: URL;
}) {
  const routes: Record<string, RouteHandler> = {};
  const publicAssetPaths = await getPublicAssetPaths(
    publicDirectory,
    manifestUrl,
  );

  for (const publicAssetPath of publicAssetPaths) {
    routes[`/${publicAssetPath}`] = () =>
      new Response(Bun.file(new URL(publicAssetPath, publicDirectory)), {
        headers: {
          "Cache-Control": getCacheControlHeader(publicAssetPath, "public"),
        },
      });
  }

  return routes;
}
