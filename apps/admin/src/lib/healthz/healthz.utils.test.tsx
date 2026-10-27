import { describe, expect, it } from "bun:test";

import {
  type BoothHealthInput,
  getBoothProblems,
  getKioskCameraHealth,
} from "./healthz.utils";

describe("getKioskCameraHealth", () => {
  const page = (
    camera: {
      status: "initializing" | "ready" | "error" | "unsupported";
      error: string | null;
    } | null,
  ) => ({
    pageId: "p",
    deviceId: "d",
    screen: "shutter" as const,
    camera,
    maintenance: false,
    connectedAt: "2026-10-16T09:00:00.000Z",
    reportedAt: null,
  });

  it("is unknown with no page, or no camera running", () => {
    expect(getKioskCameraHealth([])).toBeUndefined();
    expect(getKioskCameraHealth([page(null)])).toBeUndefined();
  });

  it("is unknown while a camera is starting", () => {
    expect(
      getKioskCameraHealth([page({ status: "initializing", error: null })]),
    ).toBeUndefined();
  });

  it("is healthy once every running camera is ready", () => {
    expect(
      getKioskCameraHealth([
        page({ status: "ready", error: null }),
        page(null),
      ]),
    ).toBe(true);
  });

  it("is unhealthy as soon as one camera failed", () => {
    expect(
      getKioskCameraHealth([
        page({ status: "ready", error: null }),
        page({ status: "error", error: "Camera permission denied." }),
      ]),
    ).toBe(false);
  });
});

describe("getBoothProblems", () => {
  const healthy = (): BoothHealthInput => ({
    shutter: { healthz: { ok: true }, kiosk: { pages: [] } },
    engine: { healthz: { ok: true } },
    puppeteer: { healthz: { ok: true } },
    printer: {
      healthz: {
        ok: true,
        details: {
          watched: true,
          changedAt: "2026-10-31T20:42:00.000Z",
          conditions: [],
        },
      },
    },
  });

  it("is empty when all is well", () => {
    expect(getBoothProblems(healthy())).toEqual([]);
  });

  it("says what the printer says, paper running low included", () => {
    const low = healthy();
    low.printer.healthz.details!.conditions = ["paper-near-end"];
    expect(getBoothProblems(low)).toEqual(["Paper is running low."]);

    const out = healthy();
    out.printer.healthz.ok = false;
    out.printer.healthz.details!.conditions = ["paper-out"];
    expect(getBoothProblems(out)).toEqual([
      expect.stringMatching(/^Out of paper since \d\d:\d\d\.$/),
    ]);
  });

  it("leaves an unwatched printer (dry run) out", () => {
    const dryRun = healthy();
    dryRun.printer.healthz.ok = false;
    dryRun.printer.healthz.details!.watched = false;
    expect(getBoothProblems(dryRun)).toEqual([]);
  });

  it("names the screen, the camera and the ticket services", () => {
    const broken = healthy();
    broken.shutter.healthz.ok = false;
    broken.puppeteer.healthz.ok = false;
    broken.shutter.kiosk.pages = [
      {
        pageId: "p",
        deviceId: "d",
        screen: "shutter",
        camera: { status: "error", error: "Denied." },
        maintenance: false,
        connectedAt: "2026-10-16T09:00:00.000Z",
        reportedAt: null,
      },
    ];
    expect(getBoothProblems(broken)).toEqual([
      "The booth screen isn't answering.",
      "The booth camera isn't working.",
      "Tickets can't be prepared right now.",
    ]);
  });
});
