import type { KioskCommand } from "@dither-booth/shared/kiosk";

import { afterEach, describe, expect, test } from "bun:test";

import { createTestDb } from "#db/internal/db.test-utils";

import { createKioskMaintenance } from "./kiosk.maintenance";

const openDbs: Array<{ close: () => void }> = [];

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close();
});

function setup({ automaticByDefault = true } = {}) {
  const { db, sqlite } = createTestDb();
  openDbs.push(sqlite);
  const sent: KioskCommand[] = [];
  const kioskChannel = {
    broadcast: (command: KioskCommand) => {
      sent.push(command);
      return 1;
    },
  };
  // Whole seconds: SQLite stores the timestamp in seconds.
  const clock = { at: Date.UTC(2026, 9, 16, 12) };
  const maintenance = createKioskMaintenance({
    automaticByDefault,
    db,
    kioskChannel,
    now: () => clock.at,
  });
  const enabledSent = () =>
    sent.map((command) => command.type === "maintenance" && command.enabled);

  return { clock, db, enabledSent, kioskChannel, maintenance };
}

describe("manual maintenance", () => {
  test("is off until staff first switch it", () => {
    const { maintenance } = setup();

    expect(maintenance.get()).toEqual({
      automatic: true,
      enabled: false,
      manual: false,
      printerFault: false,
      reasons: [],
      updatedAt: null,
    });
  });

  test("survives a restart on the same database", () => {
    const { clock, db, kioskChannel, maintenance } = setup();

    maintenance.setManual(true);
    const restarted = createKioskMaintenance({ db, kioskChannel });

    expect(restarted.get()).toMatchObject({
      enabled: true,
      manual: true,
      reasons: ["manual"],
      updatedAt: new Date(clock.at),
    });
  });

  test("switching off again updates the same row", () => {
    const { clock, maintenance } = setup();

    maintenance.setManual(true);
    clock.at += 60_000;
    maintenance.setManual(false);

    expect(maintenance.get()).toMatchObject({
      enabled: false,
      updatedAt: new Date(clock.at),
    });
  });

  test("always tells the booth screen, and says how many pages heard it", () => {
    const { enabledSent, maintenance } = setup();

    expect(maintenance.setManual(false).delivered).toBe(1);
    expect(enabledSent()).toEqual([false]);
  });
});

describe("printer maintenance", () => {
  test("a printer fault puts the booth in maintenance", () => {
    const { enabledSent, maintenance } = setup();

    maintenance.setPrinterFault(true);

    expect(maintenance.get()).toMatchObject({
      enabled: true,
      manual: false,
      reasons: ["printer"],
    });
    expect(enabledSent()).toEqual([true]);
  });

  test("the fixed printer ends it", () => {
    const { enabledSent, maintenance } = setup();

    maintenance.setPrinterFault(true);
    maintenance.setPrinterFault(false);

    expect(maintenance.get().enabled).toBe(false);
    expect(enabledSent()).toEqual([true, false]);
  });

  test("the fixed printer never ends maintenance staff turned on", () => {
    const { maintenance } = setup();

    maintenance.setManual(true);
    maintenance.setPrinterFault(true);
    maintenance.setPrinterFault(false);

    expect(maintenance.get()).toMatchObject({
      enabled: true,
      reasons: ["manual"],
    });
  });

  test("staff turning theirs off keeps the booth closed while the printer is down", () => {
    const { maintenance } = setup();

    maintenance.setPrinterFault(true);
    maintenance.setManual(true);
    maintenance.setManual(false);

    expect(maintenance.get()).toMatchObject({
      enabled: true,
      reasons: ["printer"],
    });
  });

  test("tells the booth screen only when the booth actually opens or closes", () => {
    const { enabledSent, maintenance } = setup();

    maintenance.setManual(true);
    maintenance.setPrinterFault(true);
    maintenance.setPrinterFault(false);

    expect(enabledSent()).toEqual([true]);
  });
});

describe("automatic maintenance", () => {
  test("turned off, a printer fault leaves the booth open", () => {
    const { enabledSent, maintenance } = setup();

    maintenance.setAutomatic(false);
    maintenance.setPrinterFault(true);

    expect(maintenance.get()).toMatchObject({
      automatic: false,
      enabled: false,
      printerFault: true,
      reasons: [],
    });
    expect(enabledSent()).toEqual([]);
  });

  test("turned off during a fault reopens the booth, turned on closes it again", () => {
    const { enabledSent, maintenance } = setup();

    maintenance.setPrinterFault(true);
    maintenance.setAutomatic(false);
    maintenance.setAutomatic(true);

    expect(enabledSent()).toEqual([true, false, true]);
  });

  test("starts as configured, and is not saved", () => {
    const { db, kioskChannel, maintenance } = setup({
      automaticByDefault: false,
    });

    maintenance.setAutomatic(true);
    const restarted = createKioskMaintenance({
      automaticByDefault: false,
      db,
      kioskChannel,
    });

    expect(restarted.get().automatic).toBe(false);
  });
});
