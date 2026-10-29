import type { RouteHandler } from "@dither-booth/browser-server/internal/browser-server.types";
import type { z } from "zod";

/*
 * The shape every action route of the admin server shares (Power,
 * Software): a GET answers the page's read, a POST is an action from the
 * admin's own origin, checked against its schema. Anything else is 405;
 * another origin 403; a body the schema refuses 400.
 */

const NO_STORE = { "cache-control": "no-store" } as const;

export type AdminRouteAnswer = { status: number; body: unknown };

export function createAdminActionRoute<Schema extends z.ZodType>({
  isAllowedOrigin,
  read,
  request,
  act,
}: {
  /** The page's origin check: another site must not act on the booth. */
  isAllowedOrigin: (origin: string | undefined) => boolean;
  /** What a GET answers, with 200. */
  read: () => Promise<unknown>;
  request: Schema;
  act: (request: z.infer<Schema>) => Promise<AdminRouteAnswer>;
}): RouteHandler {
  return async (req) => {
    if (req.method === "GET") {
      return Response.json(await read(), { headers: NO_STORE });
    }

    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    if (!isAllowedOrigin(req.headers.get("origin") ?? undefined)) {
      return new Response("Origin not allowed", { status: 403 });
    }

    const parsed = request.safeParse(await req.json().catch(() => undefined));

    if (!parsed.success) {
      return new Response("Unknown action", { status: 400 });
    }

    const { status, body } = await act(parsed.data);

    return Response.json(body, { headers: NO_STORE, status });
  };
}
