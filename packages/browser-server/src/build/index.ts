import {
  BUILD_ASSET_MANIFEST_FILE_NAME,
  PUBLIC_ASSET_MANIFEST_FILE_NAME,
  PRODUCTION_SERVER_FILE_NAME,
} from "#internal/browser-server.constants";
import tailwindPlugin from "bun-plugin-tailwind";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";

import { PRODUCTION_ENTRY } from "./internal/build.constants";
import { copyPublicAssets, toDistRelative } from "./internal/build.utils";

export async function buildBrowserServerApp() {
  const appRoot = process.cwd();
  const resolvedAppRoot = resolve(appRoot);
  const distDirectory = resolve(resolvedAppRoot, "dist");
  const publicDirectory = resolve(resolvedAppRoot, "public");
  const buildAssetManifest = resolve(
    distDirectory,
    BUILD_ASSET_MANIFEST_FILE_NAME,
  );
  const publicAssetManifest = resolve(
    distDirectory,
    PUBLIC_ASSET_MANIFEST_FILE_NAME,
  );

  await rm(distDirectory, { recursive: true, force: true });

  const nodeEnv = Bun.env.NODE_ENV ?? "production";
  const defineEnv: Record<string, string> = {
    "process.env.NODE_ENV": JSON.stringify(nodeEnv),
  };

  const serverResult = await Bun.build({
    entrypoints: [resolve(resolvedAppRoot, PRODUCTION_ENTRY)],
    external: ["pm2"],
    outdir: distDirectory,
    target: "bun",
    publicPath: "/",
    splitting: false,
    minify: nodeEnv === "production",
    sourcemap: "none",
    naming: {
      entry: "server.[ext]",
      chunk: "assets/[name]-[hash].[ext]",
      asset: "assets/[name]-[hash].[ext]",
    },
    define: defineEnv,
    plugins: [tailwindPlugin],
  });

  if (!serverResult.success) {
    for (const log of serverResult.logs) {
      console.error(log);
    }

    process.exit(1);
  }

  const buildPaths = new Set(
    serverResult.outputs.map((output) =>
      toDistRelative(distDirectory, output.path),
    ),
  );
  buildPaths.add(BUILD_ASSET_MANIFEST_FILE_NAME);
  buildPaths.add(PUBLIC_ASSET_MANIFEST_FILE_NAME);
  buildPaths.add(PRODUCTION_SERVER_FILE_NAME);

  const buildAssetPaths = [...buildPaths]
    .filter((path) => path.startsWith("assets/"))
    .sort();

  await Bun.write(
    buildAssetManifest,
    `${JSON.stringify(buildAssetPaths, null, 2)}\n`,
  );

  const publicAssetPaths = await copyPublicAssets(
    publicDirectory,
    distDirectory,
    buildPaths,
  );
  await Bun.write(
    publicAssetManifest,
    `${JSON.stringify(publicAssetPaths, null, 2)}\n`,
  );
}
