import { describe, expect, test } from "bun:test";

import {
  getNetworkMode,
  parseNmcliDevices,
  parseNmcliWifiList,
  splitNmcliTerse,
} from "./network";

describe("splitNmcliTerse", () => {
  test("keeps escaped colons and backslashes inside a field", () => {
    expect(splitNmcliTerse("Cafe\\:Bar:72:WPA2:*")).toEqual([
      "Cafe:Bar",
      "72",
      "WPA2",
      "*",
    ]);
    expect(splitNmcliTerse("a\\\\b:")).toEqual(["a\\b", ""]);
  });
});

describe("parseNmcliWifiList", () => {
  test("one row per network, strongest first, hidden ones dropped", () => {
    const output = [
      "Venue:40:WPA2:",
      "Venue:81:WPA2:*",
      ":90:WPA2:",
      "Open Bar:55::",
    ].join("\n");

    expect(parseNmcliWifiList(output)).toEqual([
      { inUse: true, secured: true, signal: 81, ssid: "Venue" },
      { inUse: false, secured: false, signal: 55, ssid: "Open Bar" },
    ]);
  });
});

describe("getNetworkMode", () => {
  const devices = (rows: string[]) => parseNmcliDevices(rows.join("\n"));

  test("tells the booth's own Wi-Fi from a venue network", () => {
    expect(
      getNetworkMode(devices(["wlan0:wifi:connected:booth-hotspot"])),
    ).toBe("hotspot");
    expect(getNetworkMode(devices(["wlan0:wifi:connected:Venue"]))).toBe(
      "wifi",
    );
    expect(
      getNetworkMode(
        devices(["eth0:ethernet:connected:Wired", "wlan0:wifi:disconnected:"]),
      ),
    ).toBe("ethernet");
  });

  test("loopback alone is offline", () => {
    expect(
      getNetworkMode(
        devices([
          "lo:loopback:connected (externally):lo",
          "wlan0:wifi:disconnected:",
        ]),
      ),
    ).toBe("offline");
  });
});
