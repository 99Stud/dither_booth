import type { RouteHandler } from "@dither-booth/browser-server/internal/browser-server.types";

import { stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

import { DOCS_PATH } from "./docs.constants";

const DOCS_PATH_WITHOUT_SLASH = DOCS_PATH.slice(0, -1);
/** Astro fingerprints everything under `_astro/`. */
const HASHED_ASSET_PREFIX = "_astro/";

const redirect = (location: string) =>
  new Response(null, { status: 308, headers: { location } });

const fileKind = (path: string) =>
  stat(path).then(
    (stats) => (stats.isFile() ? "file" : stats.isDirectory() ? "dir" : null),
    () => null,
  );

/**
 * Serves the static docs build at `/docs/`. The site is built with that base
 * and trailing slashes, so `/docs/venue/wifi/` is `venue/wifi/index.html`.
 * A booth that never built the docs says how to, instead of the admin SPA.
 */
export function createDocsRoutes(
  docsRoot: string,
): Record<string, RouteHandler> {
  const root = resolve(docsRoot);

  const serveDocs: RouteHandler = async (req) => {
    const { pathname, search } = new URL(req.url);
    let relativePath: string;

    try {
      relativePath = decodeURIComponent(pathname.slice(DOCS_PATH.length));
    } catch {
      return new Response("Bad request", { status: 400 });
    }

    const target = resolve(root, relativePath);

    if (target !== root && !target.startsWith(`${root}${sep}`)) {
      return new Response("Not found", { status: 404 });
    }

    const kind = await fileKind(target);

    if (kind === "dir" && !pathname.endsWith("/")) {
      return redirect(`${pathname}/${search}`);
    }

    const filePath = kind === "dir" ? join(target, "index.html") : target;

    if ((await fileKind(filePath)) === "file") {
      return new Response(Bun.file(filePath), {
        headers: {
          "cache-control": relativePath.startsWith(HASHED_ASSET_PREFIX)
            ? "public, max-age=31536000, immutable"
            : "no-cache",
        },
      });
    }

    if ((await fileKind(join(root, "index.html"))) !== "file") {
      return new Response(
        "The docs aren't built on this booth. Run `bun run docs:build` in the repo, or `sudo booth repo`.",
        {
          status: 503,
          headers: { "content-type": "text/plain; charset=utf-8" },
        },
      );
    }

    const notFoundPage = join(root, "404.html");

    return (await fileKind(notFoundPage)) === "file"
      ? new Response(Bun.file(notFoundPage), { status: 404 })
      : new Response("Not found", { status: 404 });
  };

  return {
    [DOCS_PATH_WITHOUT_SLASH]: () => redirect(DOCS_PATH),
    [`${DOCS_PATH}*`]: serveDocs,
  };
}
