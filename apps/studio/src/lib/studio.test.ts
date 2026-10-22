import { describe, expect, test } from "bun:test";

import { type AlertRow, sortAlerts, waitingAlerts } from "#lib/alerts";
import { type BoothRow, reportLine } from "#lib/booths";
import { parseRoute, pathOf } from "#lib/route";

const alert = (id: string, over: Partial<AlertRow>): AlertRow => ({
  id,
  boothId: "b",
  boothName: "Booth A",
  key: "printer.paper-out",
  severity: "critical",
  openedAt: "2026-10-31T18:00:00.000Z",
  resolvedAt: null,
  ackedAt: null,
  ...over,
});

describe("sortAlerts", () => {
  test("open first, critical before warnings, newest first; closed by when they closed", () => {
    const { open, closed } = sortAlerts([
      alert("old-warn", {
        severity: "warn",
        openedAt: "2026-10-31T17:00:00.000Z",
      }),
      alert("new-warn", {
        severity: "warn",
        openedAt: "2026-10-31T19:00:00.000Z",
      }),
      alert("critical", { openedAt: "2026-10-31T16:00:00.000Z" }),
      alert("closed-early", { resolvedAt: "2026-10-31T18:10:00.000Z" }),
      alert("closed-late", { resolvedAt: "2026-10-31T20:00:00.000Z" }),
    ]);
    expect(open.map((a) => a.id)).toEqual(["critical", "new-warn", "old-warn"]);
    expect(closed.map((a) => a.id)).toEqual(["closed-late", "closed-early"]);
  });
});

describe("waitingAlerts", () => {
  test("open and not acknowledged, most urgent first: what the banner shows", () => {
    const waiting = waitingAlerts([
      alert("warn", { severity: "warn" }),
      alert("acked", { ackedAt: "2026-10-31T18:05:00.000Z" }),
      alert("closed", { resolvedAt: "2026-10-31T18:10:00.000Z" }),
      alert("critical", {}),
    ]);
    expect(waiting.map((a) => a.id)).toEqual(["critical", "warn"]);
  });
});

describe("routes", () => {
  test.each([
    ["/", { screen: "alerts" }],
    ["/alerts/abc", { screen: "alerts", alertId: "abc" }],
    ["/booths", { screen: "booths" }],
    ["/device", { screen: "device" }],
    ["/anything-else", { screen: "alerts" }],
  ] as const)("%s", (path, route) => {
    expect(parseRoute(path)).toEqual(route);
  });

  test("a route and its path round-trip", () => {
    for (const path of ["/", "/alerts/abc", "/booths", "/device"]) {
      expect(pathOf(parseRoute(path))).toBe(path);
    }
  });
});

describe("reportLine", () => {
  const now = new Date("2026-10-31T18:10:00.000Z").getTime();
  const booth = (over: Partial<BoothRow>): BoothRow => ({
    id: "b",
    orgId: "o",
    name: "Booth A",
    liveFrom: null,
    liveUntil: null,
    registeredAt: "2026-10-30T10:00:00.000Z",
    status: null,
    ...over,
  });
  const status = (lastSeenAt: string) => ({
    lastSeenAt,
    dryRun: false,
    conditions: [],
    maintenance: false,
    release: "0.7.0",
  });

  test("says what a booth not set up yet still needs", () => {
    expect(reportLine(booth({ registeredAt: null }), now)).toEqual({
      text: "Not registered yet.",
      tone: "off",
    });
    expect(reportLine(booth({}), now).text).toBe("Registered, no report yet.");
  });

  test("a booth heard from recently is fine; one quiet for over 3 minutes is silent", () => {
    expect(
      reportLine(booth({ status: status("2026-10-31T18:09:30.000Z") }), now)
        .tone,
    ).toBe("ok");
    expect(
      reportLine(booth({ status: status("2026-10-31T18:05:00.000Z") }), now)
        .tone,
    ).toBe("warn");
  });
});
