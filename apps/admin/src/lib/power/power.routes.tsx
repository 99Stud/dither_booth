import type { RouteHandler } from "@dither-booth/browser-server/internal/browser-server.types";

import { createAdminActionRoute } from "#lib/admin-api/admin-api.routes";

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
export function createPowerRoute({
  isAllowedOrigin,
  runAction,
}: {
  isAllowedOrigin: (origin: string | undefined) => boolean;
  runAction: (action: PowerAction) => Promise<PowerResult>;
}): RouteHandler {
  return createAdminActionRoute({
    isAllowedOrigin,
    read: async () => ({ available: true }) satisfies PowerAvailability,
    request: powerRequestSchema,
    act: async ({ action }) => {
      const result = await runAction(action);
      return { status: result.ok ? 202 : 503, body: result };
    },
  });
}
