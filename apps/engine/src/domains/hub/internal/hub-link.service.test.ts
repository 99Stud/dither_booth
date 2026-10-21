import { describe, expect, test } from "bun:test";

import { createTestDb } from "#db/internal/db.test-utils";

import { linkToHub, readHubLink, unlinkFromHub } from "./hub-link.service";
import { getHubEndpoint } from "./hub.constants";

const HUB = { url: "https://hub.test", publishableKey: "sb_publishable_test" };
const NOW = new Date("2026-10-31T17:00:00.000Z");

const REGISTRATION = {
  booth: { id: "0f3e9c7a-5b1d-4c2e-8a6f-1d2c3b4a5e6f", name: "Booth A" },
  session: {
    accessToken: "access",
    refreshToken: "refresh-1",
    expiresAt: 1793000000,
  },
};

function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(respond());
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("linkToHub", () => {
  test("trades the code for a session and keeps it", async () => {
    const { db } = createTestDb();
    const { fn, calls } = fakeFetch(() => Response.json(REGISTRATION));

    const status = await linkToHub(
      { db, hub: HUB, fetch: fn, now: () => NOW },
      "7KQ2M9XD4T",
    );

    expect(status).toEqual({
      linked: true,
      hubUrl: HUB.url,
      boothId: REGISTRATION.booth.id,
      boothName: "Booth A",
      linkedAt: NOW.toISOString(),
    });
    expect(calls[0]?.url).toBe("https://hub.test/functions/v1/register-booth");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      code: "7KQ2M9XD4T",
    });
    expect(new Headers(calls[0]?.init.headers).get("apikey")).toBe(
      "sb_publishable_test",
    );
  });

  test("registering again replaces the link", async () => {
    const { db } = createTestDb();
    await linkToHub(
      { db, hub: HUB, fetch: fakeFetch(() => Response.json(REGISTRATION)).fn },
      "7KQ2M9XD4T",
    );
    const again = {
      ...REGISTRATION,
      booth: { ...REGISTRATION.booth, name: "Booth A, new Pi" },
      session: { ...REGISTRATION.session, refreshToken: "refresh-2" },
    };
    const status = await linkToHub(
      { db, hub: HUB, fetch: fakeFetch(() => Response.json(again)).fn },
      "9XD4T7KQ2M",
    );
    expect(status.linked && status.boothName).toBe("Booth A, new Pi");
  });

  test("never hands the refresh token out", async () => {
    const { db } = createTestDb();
    await linkToHub(
      { db, hub: HUB, fetch: fakeFetch(() => Response.json(REGISTRATION)).fn },
      "7KQ2M9XD4T",
    );
    expect(JSON.stringify(readHubLink(db))).not.toContain("refresh-1");
  });

  test("a bad code says so, and keeps the link the booth had", async () => {
    const { db } = createTestDb();
    await linkToHub(
      { db, hub: HUB, fetch: fakeFetch(() => Response.json(REGISTRATION)).fn },
      "7KQ2M9XD4T",
    );
    const notFound = fakeFetch(() =>
      Response.json(
        { error: "unknown, used or expired code" },
        { status: 404 },
      ),
    );

    await expect(
      linkToHub({ db, hub: HUB, fetch: notFound.fn }, "0000000000"),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(readHubLink(db).linked).toBe(true);
  });

  test("an offline booth says it can't reach the Hub", async () => {
    const { db } = createTestDb();
    const offline = (() =>
      Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch;
    await expect(
      linkToHub({ db, hub: HUB, fetch: offline }, "7KQ2M9XD4T"),
    ).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
    expect(readHubLink(db)).toEqual({ linked: false });
  });

  test("a Hub that answers something unexpected stores nothing", async () => {
    const { db } = createTestDb();
    for (const respond of [
      () => Response.json({ error: "boom" }, { status: 500 }),
      () => Response.json({ booth: { id: "not-a-uuid" } }),
      () => new Response("<html>", { status: 200 }),
    ]) {
      await expect(
        linkToHub({ db, hub: HUB, fetch: fakeFetch(respond).fn }, "7KQ2M9XD4T"),
      ).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    }
    expect(readHubLink(db)).toEqual({ linked: false });
  });
});

describe("unlinkFromHub", () => {
  test("forgets the link", async () => {
    const { db } = createTestDb();
    await linkToHub(
      { db, hub: HUB, fetch: fakeFetch(() => Response.json(REGISTRATION)).fn },
      "7KQ2M9XD4T",
    );
    unlinkFromHub(db);
    expect(readHubLink(db)).toEqual({ linked: false });
  });
});

describe("getHubEndpoint", () => {
  test("is the production Hub unless the environment says otherwise", () => {
    expect(getHubEndpoint({}).url).toBe(
      "https://cvxebmlzjudvxxesgpgq.supabase.co",
    );
    expect(
      getHubEndpoint({
        HUB_URL: "http://127.0.0.1:56321",
        HUB_PUBLISHABLE_KEY: "local",
      }),
    ).toEqual({
      url: "http://127.0.0.1:56321",
      publishableKey: "local",
    });
  });
});
