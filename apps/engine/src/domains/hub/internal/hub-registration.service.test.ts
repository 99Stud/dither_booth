import { describe, expect, test } from "bun:test";

import { hubRegistrationTable } from "#db/internal/db.schema";
import { createTestDb } from "#db/internal/db.test-utils";

import {
  forgetRegistration,
  readHubRegistration,
  registerBooth,
} from "./hub-registration.service";

const HUB = { url: "https://hub.test", publishableKey: "sb_publishable_test" };
const NOW = new Date("2026-10-31T17:00:00.000Z");

const ANSWER = {
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

async function registered() {
  const { db } = createTestDb();
  await registerBooth(
    {
      db,
      hub: HUB,
      fetch: fakeFetch(() => Response.json(ANSWER)).fn,
      now: () => NOW,
    },
    "7KQ2M9XD4T",
  );
  return db;
}

describe("registerBooth", () => {
  test("trades the code for a session and keeps it", async () => {
    const { db } = createTestDb();
    const { fn, calls } = fakeFetch(() => Response.json(ANSWER));

    const registration = await registerBooth(
      { db, hub: HUB, fetch: fn, now: () => NOW },
      "7KQ2M9XD4T",
    );

    expect(registration).toEqual({
      hubUrl: HUB.url,
      boothId: ANSWER.booth.id,
      boothName: "Booth A",
      registeredAt: NOW.toISOString(),
    });
    expect(readHubRegistration(db)).toEqual({
      registered: true,
      ...registration,
    });
    expect(db.select().from(hubRegistrationTable).get()?.refreshToken).toBe(
      "refresh-1",
    );
    expect(calls[0]?.url).toBe("https://hub.test/functions/v1/register-booth");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      code: "7KQ2M9XD4T",
    });
    expect(new Headers(calls[0]?.init.headers).get("apikey")).toBe(
      "sb_publishable_test",
    );
  });

  test("registering again replaces the registration", async () => {
    const db = await registered();
    const again = {
      booth: { ...ANSWER.booth, name: "Booth A, new Pi" },
      session: { ...ANSWER.session, refreshToken: "refresh-2" },
    };
    await registerBooth(
      { db, hub: HUB, fetch: fakeFetch(() => Response.json(again)).fn },
      "9XD4T7KQ2M",
    );
    const status = readHubRegistration(db);
    expect(status.registered && status.boothName).toBe("Booth A, new Pi");
    expect(db.select().from(hubRegistrationTable).get()?.refreshToken).toBe(
      "refresh-2",
    );
  });

  test("never hands the refresh token out", async () => {
    const db = await registered();
    expect(JSON.stringify(readHubRegistration(db))).not.toContain("refresh-1");
  });

  test.each([
    ["unknown, used or expired", 404, "NOT_FOUND"],
    ["not a code", 400, "BAD_REQUEST"],
  ])(
    "a code the Hub refuses (%s) keeps the registration the booth had",
    async (_, status, code) => {
      const db = await registered();
      const refused = fakeFetch(() =>
        Response.json({ error: "no" }, { status }),
      );
      await expect(
        registerBooth({ db, hub: HUB, fetch: refused.fn }, "0000000000"),
      ).rejects.toMatchObject({ code });
      expect(readHubRegistration(db).registered).toBe(true);
    },
  );

  test.each([
    ["no answer", () => Promise.reject(new TypeError("fetch failed"))],
    ["a Hub error", () => Response.json({ error: "boom" }, { status: 500 })],
    [
      "an answer that makes no sense",
      () => Response.json({ booth: { id: "not-a-uuid" } }),
    ],
    [
      "an answer that isn't JSON",
      () => new Response("<html>", { status: 200 }),
    ],
  ])(
    "after %s the Hub may have replaced the registration, so it is forgotten here",
    async (_, respond) => {
      const db = await registered();
      const fn = (() => respond()) as unknown as typeof fetch;
      await expect(
        registerBooth({ db, hub: HUB, fetch: fn }, "7KQ2M9XD4T"),
      ).rejects.toMatchObject({
        code: "SERVICE_UNAVAILABLE",
        message: expect.stringContaining("Ask for a new code"),
      });
      expect(readHubRegistration(db)).toEqual({ registered: false });
    },
  );
});

describe("forgetRegistration", () => {
  test("forgets it", async () => {
    const db = await registered();
    forgetRegistration(db);
    expect(readHubRegistration(db)).toEqual({ registered: false });
  });
});
