import type { KioskCamera as KioskCameraReport } from "@dither-booth/shared/kiosk";

import { afterEach, describe, expect, test } from "bun:test";

import { createKioskCamera, type KioskCameraState } from "./kiosk.camera";
import { createKioskChannel } from "./kiosk.channel";

const START = new Date("2026-10-31T18:00:00.000Z");
const LATER = new Date("2026-10-31T18:00:30.000Z");
const READY: KioskCameraReport = { status: "ready", error: null };
const FAILED: KioskCameraReport = {
  status: "error",
  error: "Camera permission denied.",
};
const STALE_AFTER_MS = 90_000;

const page = (pageId: string, screen: "shutter" | "darkroom" = "shutter") => ({
  pageId,
  deviceId: `device-${pageId}`,
  screen,
});

const cameras: Array<{ stop: () => void }> = [];
afterEach(() => {
  for (const camera of cameras.splice(0)) camera.stop();
});

function setup() {
  const clock = { at: START };
  const now = () => clock.at;
  const kioskChannel = createKioskChannel({ now });
  const flips: KioskCameraState[] = [];
  const camera = createKioskCamera({
    kioskChannel,
    staleAfterMs: STALE_AFTER_MS,
    now,
  });
  cameras.push(camera);
  camera.subscribe((state) => flips.push(state));
  const advance = (ms: number) => {
    clock.at = new Date(clock.at.getTime() + ms);
  };
  return { advance, camera, clock, flips, kioskChannel };
}

describe("createKioskCamera", () => {
  test("is off from the start, until a page is there", () => {
    const { camera, clock, flips, kioskChannel } = setup();
    expect(camera.get()).toEqual({ on: false, changedAt: START });

    clock.at = LATER;
    kioskChannel.subscribe(page("a"));
    expect(camera.get()).toEqual({ on: true, changedAt: LATER });
    expect(flips).toEqual([{ on: true, changedAt: LATER }]);
  });

  test("goes off when the page leaves, or its camera fails", () => {
    const { camera, clock, flips, kioskChannel } = setup();
    const controller = new AbortController();
    kioskChannel.subscribe(page("a"), controller.signal);
    kioskChannel.reportStatus("a", { camera: READY, maintenance: false });

    clock.at = LATER;
    kioskChannel.reportStatus("a", { camera: FAILED, maintenance: false });
    expect(camera.get()).toEqual({ on: false, changedAt: LATER });

    kioskChannel.reportStatus("a", { camera: READY, maintenance: false });
    controller.abort();
    expect(camera.get().on).toBe(false);
    expect(flips.map((flip) => flip.on)).toEqual([true, false, true, false]);
  });

  test("a page whose reports stopped is gone, once its last one is stale", () => {
    const { advance, camera, clock, flips, kioskChannel } = setup();
    kioskChannel.subscribe(page("a"));
    kioskChannel.reportStatus("a", { camera: READY, maintenance: false });

    advance(STALE_AFTER_MS - 1);
    expect(camera.get().on).toBe(true);
    advance(1);
    // Off from when the engine noticed.
    const noticedAt = clock.at;
    expect(camera.get()).toEqual({ on: false, changedAt: noticedAt });
    expect(flips.at(-1)).toEqual({ on: false, changedAt: noticedAt });

    // The same report again: the page is back.
    kioskChannel.reportStatus("a", { camera: READY, maintenance: false });
    expect(camera.get().on).toBe(true);
  });

  test("a page that never reported counts from when it connected", () => {
    const { advance, camera, kioskChannel } = setup();
    kioskChannel.subscribe(page("a"));
    expect(camera.get().on).toBe(true);

    advance(STALE_AFTER_MS);
    expect(camera.get().on).toBe(false);
  });

  test("a page with no camera counts as there; one failed camera turns it off", () => {
    const { camera, clock, flips, kioskChannel } = setup();
    kioskChannel.subscribe(page("a"));
    kioskChannel.subscribe(page("b", "darkroom"));
    kioskChannel.reportStatus("b", { camera: null, maintenance: false });
    expect(camera.get()).toEqual({ on: true, changedAt: START });

    clock.at = LATER;
    kioskChannel.reportStatus("b", { camera: READY, maintenance: true });
    expect(flips).toHaveLength(1);

    kioskChannel.reportStatus("a", { camera: FAILED, maintenance: false });
    expect(camera.get()).toEqual({ on: false, changedAt: LATER });
  });

  test("stops looking once stopped", () => {
    const { advance, camera, flips, kioskChannel } = setup();
    kioskChannel.subscribe(page("a"));
    camera.stop();

    advance(STALE_AFTER_MS);
    kioskChannel.subscribe(page("b"));
    expect(flips.map((flip) => flip.on)).toEqual([true]);
  });
});
