import { describe, expect, test } from "bun:test";

import { refuseCaptiveJoin } from "./captive.service";

describe("captive page", () => {
  const venue = { inUse: false, secured: true, signal: 69, ssid: "Venue" };

  test("refuses a protected network without its password", () => {
    expect(
      refuseCaptiveJoin(
        { nearby: [venue], state: "pick-network" },
        { ssid: "Venue" },
      ),
    ).toBe("Venue needs its password.");
    expect(
      refuseCaptiveJoin(
        { nearby: [venue], state: "pick-network" },
        { password: "venue-pass", ssid: "Venue" },
      ),
    ).toBeUndefined();
  });

  test("refuses while staff run the event on the booth Wi-Fi", () => {
    expect(
      refuseCaptiveJoin(
        { nearby: [], state: "booth-wifi-chosen" },
        { password: "venue-pass", ssid: "Venue" },
      ),
    ).toBe("The booth isn't waiting for a network.");
  });

  test("needs a password for a network the scan didn't see as open", () => {
    const open = { inUse: false, secured: false, signal: 40, ssid: "Lobby" };

    expect(
      refuseCaptiveJoin(
        { nearby: [open], state: "pick-network" },
        { ssid: "Lobby" },
      ),
    ).toBeUndefined();
    expect(
      refuseCaptiveJoin(
        { nearby: [open], state: "pick-network" },
        { ssid: "Hidden-Venue" },
      ),
    ).toBe("Hidden-Venue needs its password.");
  });
});
