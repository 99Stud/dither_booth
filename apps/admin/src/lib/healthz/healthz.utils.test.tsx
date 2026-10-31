import { describe, expect, it } from "bun:test";

import { type BoothHealthInput, getBoothProblems } from "./healthz.utils";

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
