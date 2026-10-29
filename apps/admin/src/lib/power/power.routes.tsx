import type { RouteHandler } from "@dither-booth/browser-server/internal/browser-server.types";

import type {
  PowerAction,
  PowerAvailability,
  PowerResult,
} from "./power.protocol";

import { powerRequestSchema } from "./power.protocol";

/*
 * `/admin/power`: the System page's Power panel. Served only under PM2,
 * on the booth: off it, a GET answers 404 and the panel says so. A GET
 * says the actions are there; a POST runs one.
 */

const NO_STORE = { "cache-control": "no-store" } as const;

export function createPowerRoute({
  isAllowedOrigin,
  runAction,
}: {
  /** The page's origin check: another site must not reboot the booth. */
  isAllowedOrigin: (origin: string | undefined) => boolean;
  runAction: (action: PowerAction) => Promise<PowerResult>;
}): RouteHandler {
  return async (req) => {
    if (req.method === "GET") {
      return Response.json({ available: true } satisfies PowerAvailability, {
        headers: NO_STORE,
      });
    }

    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    if (!isAllowedOrigin(req.headers.get("origin") ?? undefined)) {
      return new Response("Origin not allowed", { status: 403 });
    }

    const request = powerRequestSchema.safeParse(
      await req.json().catch(() => undefined),
    );

    if (!request.success) {
      return new Response("Unknown power action", { status: 400 });
    }

    const result = await runAction(request.data.action);

    return Response.json(result, {
      headers: NO_STORE,
      status: result.ok ? 202 : 503,
    });
  };
}
