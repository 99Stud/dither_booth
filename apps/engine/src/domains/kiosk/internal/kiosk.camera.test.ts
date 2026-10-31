import type { KioskCamera as KioskCameraReport } from "@dither-booth/shared/kiosk";

import { describe, expect, test } from "bun:test";

import { createKioskCamera, type KioskCameraState } from "./kiosk.camera";
import { createKioskChannel } from "./kiosk.channel";

const START = new Date("2026-10-31T18:00:00.000Z");
const LATER = new Date("2026-10-31T18:00:30.000Z");
const READY: KioskCameraReport = { status: "ready", error: null };
const FAILED: KioskCameraReport = {
  status: "error",
  error: "Camera permission denied.",
};

const page = (pageId: string, screen: "shutter" | "darkroom" = "shutter") => ({
  pageId,
  deviceId: `device-${pageId}`,
  screen,
});

function setup() {
  const kioskChannel = createKioskChannel();
  const clock = { at: START };
  const flips: KioskCameraState[] = [];
  const camera = createKioskCamera({ kioskChannel, now: () => clock.at });
  camera.subscribe((state) => flips.push(state));
  return { camera, clock, flips, kioskChannel };
}

describe("createKioskCamera", () => {
  test("is off from the start, until a page shows a picture", () => {
    const { camera, clock, flips, kioskChannel } = setup();
    expect(camera.get()).toEqual({ ready: false, changedAt: START });

    kioskChannel.subscribe(page("a"));
    expect(camera.get().ready).toBe(false);

    clock.at = LATER;
    kioskChannel.reportStatus("a", { camera: READY, maintenance: false });
    expect(camera.get()).toEqual({ ready: true, changedAt: LATER });
    expect(flips).toEqual([{ ready: true, changedAt: LATER }]);
  });

  test("goes off when the page leaves, or its camera fails", () => {
    const { camera, clock, flips, kioskChannel } = setup();
    const controller = new AbortController();
    kioskChannel.subscribe(page("a"), controller.signal);
    kioskChannel.reportStatus("a", { camera: READY, maintenance: false });

    clock.at = LATER;
    kioskChannel.reportStatus("a", { camera: FAILED, maintenance: false });
    expect(camera.get()).toEqual({ ready: false, changedAt: LATER });

    kioskChannel.reportStatus("a", { camera: READY, maintenance: false });
    controller.abort();
    expect(camera.get().ready).toBe(false);
    expect(flips.map((flip) => flip.ready)).toEqual([true, false, true, false]);
  });

  test("any page's picture counts, and a report that changes nothing is no flip", () => {
    const { camera, clock, flips, kioskChannel } = setup();
    kioskChannel.subscribe(page("a"));
    kioskChannel.subscribe(page("b", "darkroom"));
    kioskChannel.reportStatus("b", { camera: READY, maintenance: false });
    expect(camera.get()).toEqual({ ready: true, changedAt: START });

    clock.at = LATER;
    kioskChannel.reportStatus("a", { camera: FAILED, maintenance: false });
    kioskChannel.reportStatus("b", { camera: READY, maintenance: true });
    expect(camera.get()).toEqual({ ready: true, changedAt: START });
    expect(flips).toHaveLength(1);
  });
});
