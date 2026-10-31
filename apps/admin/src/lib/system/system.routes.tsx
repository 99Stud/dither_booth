import type { RouteHandler } from "@dither-booth/browser-server/internal/browser-server.types";

import type { SystemSampler } from "./system.sampler";

/*
 * `/admin/system`: the System page's one way in, and the Health card's Pi
 * row. One JSON snapshot per request, never cached. The admin server opens
 * it only to a page signed in with the staff PIN (`staffSession.guard`).
 */

const NO_STORE = { "cache-control": "no-store" } as const;

export function createSystemRoute(sampler: SystemSampler): RouteHandler {
  return async (req) => {
    if (req.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      return Response.json(await sampler.snapshot(), { headers: NO_STORE });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { headers: NO_STORE, status: 503 },
      );
    }
  };
}
