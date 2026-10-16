import { describe, expect, test } from "bun:test";

import { KIOSK_RELOAD_IDLE_TIMEOUT_MS } from "./Experience.constants";
import {
  getKioskCommandTiming,
  toPendingKioskCommand,
} from "./Experience.kiosk";

const REQUESTED_AT = 1_000_000;

describe("getKioskCommandTiming", () => {
  test("a reload now runs in any phase", () => {
    expect(
      getKioskCommandTiming({
        mode: "now",
        now: REQUESTED_AT,
        phase: "printing",
        requestedAt: REQUESTED_AT,
      }),
    ).toBe("run");
  });

  test("a reload when idle waits for the landing screen", () => {
    const pending = { mode: "when-idle", requestedAt: REQUESTED_AT } as const;

    expect(
      getKioskCommandTiming({
        ...pending,
        now: REQUESTED_AT,
        phase: "countdown",
      }),
    ).toBe("wait");
    expect(
      getKioskCommandTiming({
        ...pending,
        now: REQUESTED_AT + 5_000,
        phase: "idle",
      }),
    ).toBe("run");
  });

  test("a reload when idle stops waiting once the timeout has passed", () => {
    const pending = { mode: "when-idle", requestedAt: REQUESTED_AT } as const;

    expect(
      getKioskCommandTiming({
        ...pending,
        now: REQUESTED_AT + KIOSK_RELOAD_IDLE_TIMEOUT_MS - 1,
        phase: "spinning",
      }),
    ).toBe("wait");
    expect(
      getKioskCommandTiming({
        ...pending,
        now: REQUESTED_AT + KIOSK_RELOAD_IDLE_TIMEOUT_MS,
        phase: "spinning",
      }),
    ).toBe("run");
  });
});

describe("toPendingKioskCommand", () => {
  test("a reload keeps its mode", () => {
    expect(
      toPendingKioskCommand(
        { type: "reload", mode: "now", commandId: "c1" },
        REQUESTED_AT,
      ),
    ).toEqual({
      commandId: "c1",
      action: "reload",
      mode: "now",
      requestedAt: REQUESTED_AT,
    });
  });

  test("opening the Darkroom waits for the landing screen", () => {
    expect(
      toPendingKioskCommand(
        { type: "navigate", screen: "darkroom", commandId: "c1" },
        REQUESTED_AT,
      ),
    ).toEqual({
      commandId: "c1",
      action: "open-darkroom",
      mode: "when-idle",
      requestedAt: REQUESTED_AT,
    });
  });

  test("going back to the Shutter is a no-op on the Shutter", () => {
    expect(
      toPendingKioskCommand(
        { type: "navigate", screen: "shutter", commandId: "c1" },
        REQUESTED_AT,
      ),
    ).toBeUndefined();
  });
});
