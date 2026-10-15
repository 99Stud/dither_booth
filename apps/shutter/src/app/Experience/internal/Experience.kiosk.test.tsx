import { describe, expect, test } from "bun:test";

import { KIOSK_RELOAD_IDLE_TIMEOUT_MS } from "./Experience.constants";
import { getKioskReloadAction } from "./Experience.kiosk";

const REQUESTED_AT = 1_000_000;

describe("getKioskReloadAction", () => {
  test("a reload now runs in any phase", () => {
    expect(
      getKioskReloadAction({
        mode: "now",
        now: REQUESTED_AT,
        phase: "printing",
        requestedAt: REQUESTED_AT,
      }),
    ).toBe("reload");
  });

  test("a reload when idle waits for the landing screen", () => {
    const pending = { mode: "when-idle", requestedAt: REQUESTED_AT } as const;

    expect(
      getKioskReloadAction({
        ...pending,
        now: REQUESTED_AT,
        phase: "countdown",
      }),
    ).toBe("wait");
    expect(
      getKioskReloadAction({
        ...pending,
        now: REQUESTED_AT + 5_000,
        phase: "idle",
      }),
    ).toBe("reload");
  });

  test("a reload when idle stops waiting once the timeout has passed", () => {
    const pending = { mode: "when-idle", requestedAt: REQUESTED_AT } as const;

    expect(
      getKioskReloadAction({
        ...pending,
        now: REQUESTED_AT + KIOSK_RELOAD_IDLE_TIMEOUT_MS - 1,
        phase: "spinning",
      }),
    ).toBe("wait");
    expect(
      getKioskReloadAction({
        ...pending,
        now: REQUESTED_AT + KIOSK_RELOAD_IDLE_TIMEOUT_MS,
        phase: "spinning",
      }),
    ).toBe("reload");
  });
});
