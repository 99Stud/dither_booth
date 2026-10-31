import { afterEach, describe, expect, test } from "bun:test";

import { darkroomAccessTable } from "#db/internal/db.schema";
import { createTestDb } from "#db/internal/db.test-utils";

import { createDarkroomAccess } from "./darkroom.access";
import {
  DARKROOM_LOCKOUT_MS,
  DARKROOM_MAX_FAILED_UNLOCKS,
  DARKROOM_MAX_LOCKOUT_MS,
  DARKROOM_TOKEN_IDLE_TTL_MS,
} from "./darkroom.constants";

const openDbs: Array<{ close: () => void }> = [];

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close();
});

function setup() {
  const { db, sqlite } = createTestDb();
  openDbs.push(sqlite);
  const clock = { at: Date.UTC(2026, 9, 15, 12) };
  const access = createDarkroomAccess({ db, now: () => clock.at });

  return { access, clock, db };
}

describe("createDarkroomAccess", () => {
  test("stays locked until a PIN is set", async () => {
    const { access } = setup();

    expect(access.getPinStatus()).toEqual({ isSet: false, updatedAt: null });
    await expect(access.unlock("2468")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("the right PIN gives a token that verifies; a wrong one doesn't", async () => {
    const { access } = setup();
    await access.setPin("2468");

    await expect(access.unlock("1357")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    const { token } = await access.unlock("2468");

    expect(access.verify(token)).toBe(true);
    expect(access.verify("not-a-token")).toBe(false);
    expect(access.verify(undefined)).toBe(false);
  });

  test("pauses unlocking after too many wrong PINs", async () => {
    const { access, clock } = setup();
    await access.setPin("2468");

    for (let i = 0; i < DARKROOM_MAX_FAILED_UNLOCKS; i++) {
      await expect(access.unlock("0000")).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    }
    // Even the right PIN waits out the lockout.
    await expect(access.unlock("2468")).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });

    clock.at += DARKROOM_LOCKOUT_MS;
    await expect(access.unlock("2468")).resolves.toHaveProperty("token");
  });

  test("each lockout doubles the next, up to the cap, until the right PIN", async () => {
    const { access, clock } = setup();
    await access.setPin("2468");

    const guessUntilLocked = async () => {
      for (let i = 0; i < DARKROOM_MAX_FAILED_UNLOCKS; i++) {
        await expect(access.checkPin("0000")).rejects.toMatchObject({
          code: "UNAUTHORIZED",
        });
      }
    };
    const expectLockedFor = async (ms: number) => {
      clock.at += ms - 1;
      await expect(access.checkPin("2468")).rejects.toMatchObject({
        code: "TOO_MANY_REQUESTS",
      });
      clock.at += 1;
    };

    await guessUntilLocked();
    await expectLockedFor(DARKROOM_LOCKOUT_MS);
    await guessUntilLocked();
    await expectLockedFor(DARKROOM_LOCKOUT_MS * 2);
    // 4 and 8 minutes, then the 15 minute cap instead of 16.
    for (let i = 0; i < 2; i++) {
      await guessUntilLocked();
      clock.at += DARKROOM_MAX_LOCKOUT_MS;
    }
    await guessUntilLocked();
    await expectLockedFor(DARKROOM_MAX_LOCKOUT_MS);

    // The right PIN resets the escalation.
    await expect(access.checkPin("2468")).resolves.toBeUndefined();
    await guessUntilLocked();
    await expectLockedFor(DARKROOM_LOCKOUT_MS);
    // Each wrong PIN is an argon2 check: this test makes about 40.
  }, 30_000);

  test("checkPin opens no session", async () => {
    const { access } = setup();
    await access.setPin("2468");

    await expect(access.checkPin("2468")).resolves.toBeUndefined();
    await expect(access.checkPin("1357")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("a token expires when idle, and each use pushes the expiry back", async () => {
    const { access, clock } = setup();
    await access.setPin("2468");
    const { token, expiresAt } = await access.unlock("2468");

    expect(new Date(expiresAt).getTime()).toBe(
      clock.at + DARKROOM_TOKEN_IDLE_TTL_MS,
    );

    clock.at += DARKROOM_TOKEN_IDLE_TTL_MS - 1;
    expect(access.verify(token)).toBe(true);

    clock.at += DARKROOM_TOKEN_IDLE_TTL_MS - 1;
    expect(access.verify(token)).toBe(true);

    clock.at += DARKROOM_TOKEN_IDLE_TTL_MS;
    expect(access.verify(token)).toBe(false);
  });

  test("locking ends one session", async () => {
    const { access } = setup();
    await access.setPin("2468");
    const first = await access.unlock("2468");
    const second = await access.unlock("2468");

    access.lock(first.token);

    expect(access.verify(first.token)).toBe(false);
    expect(access.verify(second.token)).toBe(true);
  });

  test("a new PIN signs every Darkroom out and stores only a hash", async () => {
    const { access, db } = setup();
    await access.setPin("2468");
    const { token } = await access.unlock("2468");

    await access.setPin("97531");

    expect(access.verify(token)).toBe(false);
    await expect(access.unlock("2468")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(access.unlock("97531")).resolves.toHaveProperty("token");

    const rows = db.select().from(darkroomAccessTable).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.pinHash).not.toContain("97531");
    expect(rows[0]?.pinHash).toStartWith("$argon2id$");
    expect(access.getPinStatus().isSet).toBe(true);
  });
});
