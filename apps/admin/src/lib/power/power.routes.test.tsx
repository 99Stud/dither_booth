import { describe, expect, it } from "bun:test";

import type { PowerAction } from "./power.protocol";

import { powerResultSchema } from "./power.protocol";
import { createPowerRoute } from "./power.routes";

const ADMIN = "https://ditherbooth.local:3002";

const post = (body: unknown, origin: string | null = ADMIN) =>
  new Request(`${ADMIN}/admin/power`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });

const createRoute = () => {
  const ran: PowerAction[] = [];
  const route = createPowerRoute({
    isAllowedOrigin: (origin) => origin === ADMIN,
    runAction: async (action) => {
      ran.push(action);
      return { ok: true, action, acceptedAt: "2026-10-29T10:00:00.000Z" };
    },
  });

  return { ran, route };
};

describe("createPowerRoute", () => {
  it("says the actions are there, never cached", async () => {
    const { route } = createRoute();
    const response = await route(new Request(`${ADMIN}/admin/power`));

    expect(response?.status).toBe(200);
    expect(response?.headers.get("cache-control")).toBe("no-store");
    expect(await response?.json()).toEqual({ available: true });
  });

  it("runs the action the page asked for and answers 202", async () => {
    const { ran, route } = createRoute();
    const response = await route(post({ action: "reboot" }));

    expect(response?.status).toBe(202);
    expect(powerResultSchema.parse(await response?.json())).toMatchObject({
      ok: true,
      action: "reboot",
    });
    expect(ran).toEqual(["reboot"]);
  });

  it("refuses another site, or no origin at all, and runs nothing", async () => {
    const { ran, route } = createRoute();

    expect(
      (await route(post({ action: "power-off" }, "https://evil.example")))
        ?.status,
    ).toBe(403);
    expect((await route(post({ action: "power-off" }, null)))?.status).toBe(
      403,
    );
    expect(ran).toEqual([]);
  });

  it("refuses an unknown action, and anything but GET and POST", async () => {
    const { ran, route } = createRoute();

    expect((await route(post({ action: "stop-everything" })))?.status).toBe(
      400,
    );
    expect(
      (
        await route(
          new Request(`${ADMIN}/admin/power`, {
            method: "DELETE",
            headers: { origin: ADMIN },
          }),
        )
      )?.status,
    ).toBe(405);
    expect(ran).toEqual([]);
  });

  it("answers 503 with the reason when systemctl refused", async () => {
    const route = createPowerRoute({
      isAllowedOrigin: () => true,
      runAction: async () => ({
        ok: false,
        code: "not-permitted",
        message: "Run `sudo booth service` on the booth.",
      }),
    });
    const response = await route(post({ action: "restart-apps" }));

    expect(response?.status).toBe(503);
    expect(powerResultSchema.parse(await response?.json())).toMatchObject({
      ok: false,
      code: "not-permitted",
    });
  });
});
