import { describe, expect, it } from "bun:test";

import {
  type BoothCameraReport,
  formatLiveDuration,
  getLiveViewStatus,
} from "./BoothCameraCard.utils";

const READY: BoothCameraReport = {
  screen: "shutter",
  camera: { status: "ready", error: null },
  cameraViewers: 0,
  isUnreachable: false,
};
const IDLE = { status: "idle" } as const;

describe("getLiveViewStatus", () => {
  it("can watch when the photo booth camera is ready", () => {
    expect(getLiveViewStatus(IDLE, READY)).toEqual({
      canWatch: true,
      message: null,
    });
  });

  it("says why it can't watch", () => {
    const cases: Array<[Partial<BoothCameraReport>, string]> = [
      [{ isUnreachable: true }, "Can't reach the booth."],
      [{ screen: undefined }, "The booth screen is offline."],
      [{ screen: "darkroom" }, "The camera is off while the Darkroom is open."],
      [
        { camera: { status: "error", error: "denied" } },
        "The booth camera isn't working. See Health checks.",
      ],
      [{ camera: null }, "The booth camera is starting…"],
      [{ cameraViewers: 2 }, "2 people are already watching."],
    ];

    for (const [change, message] of cases) {
      expect(getLiveViewStatus(IDLE, { ...READY, ...change })).toEqual({
        canWatch: false,
        message,
      });
    }
  });

  it("connecting and live block a second watch", () => {
    expect(getLiveViewStatus({ status: "connecting" }, READY)).toEqual({
      canWatch: false,
      message: "Connecting to the booth camera…",
    });
    expect(getLiveViewStatus({ status: "live" }, READY)).toEqual({
      canWatch: false,
      message: null,
    });
  });

  it("says why the last view ended, and lets you watch again", () => {
    expect(
      getLiveViewStatus({ status: "ended", reason: "timeout" }, READY),
    ).toEqual({
      canWatch: true,
      message: "Stopped after 10 minutes, to spare the iPad.",
    });
    expect(
      getLiveViewStatus({ status: "ended", reason: "viewer-left" }, READY),
    ).toEqual({ canWatch: true, message: null });
    expect(
      getLiveViewStatus(
        { status: "ended", reason: "failed" },
        { ...READY, screen: undefined },
      ),
    ).toEqual({
      canWatch: false,
      message:
        "Couldn't reach the booth camera. Live view works on the booth's Wi-Fi for now.",
    });
  });
});

describe("formatLiveDuration", () => {
  it("counts minutes and seconds", () => {
    expect(formatLiveDuration(0)).toBe("00:00");
    expect(formatLiveDuration(65_400)).toBe("01:05");
    expect(formatLiveDuration(600_000)).toBe("10:00");
  });
});
