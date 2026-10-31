import { TRPCClientError } from "@trpc/client";
import { describe, expect, it } from "bun:test";

import type { StaffSessionEngine } from "./staff-session.routes";

import {
  STAFF_SESSION_COOKIE,
  STAFF_SESSION_OFFLINE_TTL_MS,
} from "./staff-session.constants";
import { createStaffSession } from "./staff-session.routes";

const ADMIN = "https://ditherbooth.local:3002";
const PIN = "2468";
const TOKEN = "live-token";

const engineError = (code: string, message: string) =>
  new TRPCClientError(message, {
    result: { error: { code: -32_001, message, data: { code } } },
  });

const createSession = () => {
  const clock = { at: Date.UTC(2026, 9, 31, 20) };
  const state = {
    live: new Set<string>(),
    down: false,
    locked: [] as string[],
  };
  const reach = () => {
    if (state.down) throw new TRPCClientError("fetch failed");
  };
  const engine: StaffSessionEngine = {
    unlock: async (pin) => {
      reach();
      if (pin !== PIN) throw engineError("UNAUTHORIZED", "Wrong PIN.");
      state.live.add(TOKEN);
      return { token: TOKEN, expiresAt: "" };
    },
    lock: async (token) => {
      reach();
      state.locked.push(token);
      state.live.delete(token);
    },
    getSession: async (token) => {
      reach();
      return { pinSet: true, signedIn: !!token && state.live.has(token) };
    },
  };
  const session = createStaffSession({
    engine,
    isAllowedOrigin: (origin) => origin === ADMIN,
    now: () => clock.at,
  });

  return { clock, session, state };
};

const request = (
  path: string,
  init: {
    method?: string;
    body?: unknown;
    cookie?: string;
    origin?: string;
  } = {},
) =>
  new Request(`${ADMIN}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "content-type": "application/json",
      origin: init.origin ?? ADMIN,
      ...(init.cookie ? { cookie: init.cookie } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

const signedIn = `${STAFF_SESSION_COOKIE}=${TOKEN}`;
const ok = () => new Response("ok");

describe("createStaffSession", () => {
  it("trades the right PIN for an HttpOnly, strict, secure cookie", async () => {
    const { session } = createSession();
    const response = await session.route(
      request("/admin/session", { method: "POST", body: { pin: PIN } }),
    );

    expect(response?.status).toBe(204);
    const cookie = response?.headers.get("set-cookie") ?? "";
    expect(cookie).toStartWith(`${STAFF_SESSION_COOKIE}=${TOKEN}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie.toLowerCase()).toContain("samesite=strict");
  });

  it("passes the engine's refusal on, with its message", async () => {
    const { session } = createSession();
    const response = await session.route(
      request("/admin/session", { method: "POST", body: { pin: "1357" } }),
    );

    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({ message: "Wrong PIN." });
  });

  it("refuses another origin and a malformed PIN", async () => {
    const { session } = createSession();

    const foreign = await session.route(
      request("/admin/session", {
        method: "POST",
        body: { pin: PIN },
        origin: "https://evil.example",
      }),
    );
    const malformed = await session.route(
      request("/admin/session", { method: "POST", body: { pin: "12" } }),
    );

    expect(foreign?.status).toBe(403);
    expect(malformed?.status).toBe(400);
  });

  it("guards a route until the page signs in", async () => {
    const { session, state } = createSession();
    const route = session.guard(ok);

    expect((await route(request("/admin/system")))?.status).toBe(401);
    expect(
      (await route(request("/admin/system", { cookie: signedIn })))?.status,
    ).toBe(401);

    state.live.add(TOKEN);
    expect(
      (await route(request("/admin/system", { cookie: signedIn })))?.status,
    ).toBe(200);
  });

  it("signs out: locks the token and clears the cookie", async () => {
    const { session, state } = createSession();
    state.live.add(TOKEN);

    const response = await session.route(
      request("/admin/session", { method: "DELETE", cookie: signedIn }),
    );

    expect(response?.status).toBe(204);
    expect(state.locked).toEqual([TOKEN]);
    expect(response?.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("while the engine is down, trusts a token it confirmed recently", async () => {
    const { clock, session, state } = createSession();
    const route = session.guard(ok);
    state.live.add(TOKEN);
    await route(request("/admin/system", { cookie: signedIn }));

    state.down = true;
    clock.at += STAFF_SESSION_OFFLINE_TTL_MS - 1;
    expect(
      (await route(request("/admin/system", { cookie: signedIn })))?.status,
    ).toBe(200);
    expect(
      (await route(request("/admin/system", { cookie: "dither_staff=other" })))
        ?.status,
    ).toBe(401);

    clock.at += 1;
    expect(
      (await route(request("/admin/system", { cookie: signedIn })))?.status,
    ).toBe(401);
  });

  it("checks the socket upgrade the same way", async () => {
    const { session, state } = createSession();

    expect(
      (await session.validateUpgrade(request("/admin/logs")))?.status,
    ).toBe(401);
    state.live.add(TOKEN);
    expect(
      await session.validateUpgrade(
        request("/admin/logs", { cookie: signedIn }),
      ),
    ).toBeUndefined();
  });

  it("forwards only the cookie's token to the engine", () => {
    const { session } = createSession();
    const headers = new Headers({
      cookie: signedIn,
      "x-darkroom-token": "forged",
    });

    session.proxyHeaders(
      headers,
      request("/engine/trpc/x", { cookie: signedIn }),
    );
    expect(headers.get("x-darkroom-token")).toBe(TOKEN);
    expect(headers.has("cookie")).toBe(false);

    const anonymous = new Headers({ "x-darkroom-token": "forged" });
    session.proxyHeaders(anonymous, request("/engine/trpc/x"));
    expect(anonymous.has("x-darkroom-token")).toBe(false);
  });
});
