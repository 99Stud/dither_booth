import { afterEach, describe, expect, test } from "bun:test";

import { createTestDb } from "#db/internal/db.test-utils";

import { createKioskMaintenance } from "./kiosk.maintenance";

const openDbs: Array<{ close: () => void }> = [];

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close();
});

function setup() {
  const { db, sqlite } = createTestDb();
  openDbs.push(sqlite);
  // Whole seconds: SQLite stores the timestamp in seconds.
  const clock = { at: Date.UTC(2026, 9, 16, 12) };
  const maintenance = createKioskMaintenance({ db, now: () => clock.at });

  return { clock, db, maintenance };
}

describe("createKioskMaintenance", () => {
  test("is off until it is first switched", () => {
    const { maintenance } = setup();

    expect(maintenance.get()).toEqual({ enabled: false, updatedAt: null });
  });

  test("keeps the switch across a new service on the same database", () => {
    const { clock, db, maintenance } = setup();

    maintenance.set(true);
    const restarted = createKioskMaintenance({ db });

    expect(restarted.get()).toEqual({
      enabled: true,
      updatedAt: new Date(clock.at),
    });
  });

  test("switching off again updates the same row", () => {
    const { clock, maintenance } = setup();

    maintenance.set(true);
    clock.at += 60_000;
    maintenance.set(false);

    expect(maintenance.get()).toEqual({
      enabled: false,
      updatedAt: new Date(clock.at),
    });
  });
});
