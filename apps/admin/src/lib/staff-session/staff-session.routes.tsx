import type {
  RouteHandler,
  WebSocketUpgradeValidator,
} from "@dither-booth/browser-server/internal/browser-server.types";

import {
  DARKROOM_TOKEN_HEADER,
  darkroomPinSchema,
  type DarkroomSession,
  type DarkroomUnlock,
} from "@dither-booth/shared/darkroom";
import { TRPCClientError } from "@trpc/client";
import z from "zod";

import {
  STAFF_SESSION_COOKIE,
  STAFF_SESSION_OFFLINE_TTL_MS,
  STAFF_SESSION_REQUIRED_MESSAGE,
} from "./staff-session.constants";

/*
 * Admin is behind the staff PIN. The booth prints tickets that lead to
 * admin, and they can end up with a guest; anything but a browser can claim
 * admin's origin. The engine holds the PIN and its tokens; here, the token
 * lives in an HttpOnly cookie, and every admin route checks it.
 */

export type StaffSessionEngine = {
  /** Throws the engine's error: UNAUTHORIZED, TOO_MANY_REQUESTS. */
  unlock: (pin: string) => Promise<DarkroomUnlock>;
  lock: (token: string) => Promise<void>;
  getSession: (token: string | undefined) => Promise<DarkroomSession>;
};

const NO_STORE = { "cache-control": "no-store" } as const;

const signInSchema = z.object({ pin: darkroomPinSchema });

const ENGINE_STATUS: Record<string, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  TOO_MANY_REQUESTS: 429,
};

const message = (status: number, text: string, headers?: HeadersInit) =>
  Response.json(
    { message: text },
    { status, headers: { ...NO_STORE, ...headers } },
  );

const sessionCookie = (token: string, maxAge?: number) =>
  new Bun.Cookie(STAFF_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    // No max age: the cookie ends with the browser session, the token after
    // 30 idle minutes.
    ...(maxAge === undefined ? {} : { maxAge }),
  }).serialize();

export function createStaffSession({
  engine,
  isAllowedOrigin,
  now = () => Date.now(),
}: {
  engine: StaffSessionEngine;
  /** The page's origin check: another site must not sign in or out. */
  isAllowedOrigin: (origin: string | undefined) => boolean;
  now?: () => number;
}) {
  /** token → when the engine last confirmed it, for while it's down. */
  const confirmed = new Map<string, number>();

  const tokenOf = (req: Request) =>
    new Bun.CookieMap(req.headers.get("cookie") ?? "").get(
      STAFF_SESSION_COOKIE,
    ) ?? undefined;

  /**
   * Whether the request's token is live. The engine decides; while it
   * doesn't answer, a token it confirmed in the last 30 minutes still counts.
   */
  const isSignedIn = async (req: Request) => {
    const token = tokenOf(req);
    if (!token) return false;

    try {
      const { signedIn } = await engine.getSession(token);
      if (signedIn) confirmed.set(token, now());
      else confirmed.delete(token);
      return signedIn;
    } catch (error) {
      // The engine answered, with an error: no session to vouch for.
      if (error instanceof TRPCClientError && error.data) return false;
      const at = confirmed.get(token);
      return at !== undefined && now() - at < STAFF_SESSION_OFFLINE_TTL_MS;
    }
  };

  const refuse = () => message(401, STAFF_SESSION_REQUIRED_MESSAGE);

  /** `/admin/session`: POST the PIN to sign in, DELETE to sign out. */
  const route: RouteHandler = async (req) => {
    if (req.method !== "POST" && req.method !== "DELETE") {
      return new Response("Method not allowed", { status: 405 });
    }

    if (!isAllowedOrigin(req.headers.get("origin") ?? undefined)) {
      return new Response("Origin not allowed", { status: 403 });
    }

    if (req.method === "DELETE") {
      const token = tokenOf(req);
      if (token) {
        confirmed.delete(token);
        await engine.lock(token).catch(() => {});
      }
      return new Response(null, {
        status: 204,
        headers: { ...NO_STORE, "set-cookie": sessionCookie("", 0) },
      });
    }

    const parsed = signInSchema.safeParse(
      await req.json().catch(() => undefined),
    );
    if (!parsed.success) return message(400, "Use 4 to 8 digits.");

    try {
      const { token } = await engine.unlock(parsed.data.pin);
      confirmed.set(token, now());
      return new Response(null, {
        status: 204,
        headers: { ...NO_STORE, "set-cookie": sessionCookie(token) },
      });
    } catch (error) {
      const status =
        error instanceof TRPCClientError
          ? ENGINE_STATUS[String(error.data?.code)]
          : undefined;

      return status
        ? message(status, (error as Error).message)
        : message(503, "Can't reach the engine. Try again in a moment.");
    }
  };

  return {
    route,
    /** An admin route that answers only a signed-in page. */
    guard:
      (handler: RouteHandler): RouteHandler =>
      async (req, server) =>
        (await isSignedIn(req)) ? handler(req, server) : refuse(),
    /** For admin's sockets: browsers send the cookie with the upgrade. */
    validateUpgrade: (async (req) =>
      (await isSignedIn(req))
        ? undefined
        : refuse()) satisfies WebSocketUpgradeValidator,
    /**
     * For the `/engine/trpc` proxy: the cookie becomes the engine's
     * header, and only the cookie does.
     */
    proxyHeaders: (headers: Headers, req: Request) => {
      headers.delete("cookie");
      headers.delete(DARKROOM_TOKEN_HEADER);
      const token = tokenOf(req);
      if (token) headers.set(DARKROOM_TOKEN_HEADER, token);
    },
  };
}
