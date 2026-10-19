import { describe, expect, test } from "bun:test";

import type { Nmcli } from "./network.nmcli";

import {
  forgetWifiNetwork,
  getBoothWifiCredentials,
  getNetworkStatus,
  saveWifiNetwork,
  type NetworkDeps,
} from "./network.service";

/** Answers nmcli calls by their joined arguments and records every call. */
function fakeNmcli(answers: Record<string, string> = {}) {
  const calls: string[][] = [];
  const nmcli: Nmcli = async (args) => {
    calls.push(args);
    const key = args.join(" ");
    const stdout = Object.entries(answers).find(([prefix]) =>
      key.startsWith(prefix),
    )?.[1];
    return { exitCode: 0, stderr: "", stdout: stdout ?? "" };
  };
  const scheduled: Array<() => Promise<unknown>> = [];
  const deps: NetworkDeps = {
    later: (task) => {
      scheduled.push(task);
    },
    nmcli,
  };
  return { calls, deps, scheduled };
}

describe("network", () => {
  test("reports the venue network, what's around and what's saved", async () => {
    const { deps } = fakeNmcli({
      "-t -f DEVICE,TYPE,STATE,CONNECTION device":
        "wlan0:wifi:connected:Venue\neth0:ethernet:unavailable:\n",
      "-t -g 802-11-wireless.ssid connection show id Venue": "Venue\n",
      "-t -f SSID,SIGNAL,SECURITY,IN-USE device wifi list":
        "Venue:80:WPA2:*\nBar:30:WPA2:\n",
      "-t -f NAME,TYPE connection show":
        "Venue:802-11-wireless\nbooth-hotspot:802-11-wireless\nWired:802-3-ethernet\n",
    });

    const status = await getNetworkStatus(deps);

    expect(status).toMatchObject({
      available: true,
      mode: "wifi",
      saved: ["Venue"],
      ssid: "Venue",
    });
    expect(status.available && status.nearby.map((n) => n.ssid)).toEqual([
      "Venue",
      "Bar",
    ]);
  });

  test("without NetworkManager (a laptop), says so instead of failing", async () => {
    const deps: NetworkDeps = {
      later: () => {},
      nmcli: async () => {
        throw new Error("ENOENT");
      },
    };

    expect(await getNetworkStatus(deps)).toEqual({ available: false });
  });

  test("saves a network, and joins it only after answering", async () => {
    const { calls, deps, scheduled } = fakeNmcli();

    await saveWifiNetwork(deps, {
      connectNow: true,
      password: "venue-pass",
      ssid: "Venue",
    });

    expect(calls.map((args) => args.slice(0, 2).join(" "))).toEqual([
      "connection delete",
      "connection add",
    ]);
    expect(calls[1]).toContain("venue-pass");
    expect(scheduled).toHaveLength(1);
    await scheduled[0]?.();
    expect(calls.at(-1)).toEqual(["connection", "up", "id", "Venue"]);
  });

  test("an open network is saved without a password", async () => {
    const { calls, deps, scheduled } = fakeNmcli();

    await saveWifiNetwork(deps, { connectNow: false, ssid: "Open Bar" });

    expect(calls[1]).not.toContain("wifi-sec.psk");
    expect(scheduled).toHaveLength(0);
  });

  test("the booth Wi-Fi can't be overwritten or forgotten", async () => {
    const { deps } = fakeNmcli();

    expect(
      saveWifiNetwork(deps, { connectNow: true, ssid: "booth-hotspot" }),
    ).rejects.toThrow();
    expect(
      forgetWifiNetwork(deps, { ssid: "booth-hotspot" }),
    ).rejects.toThrow();
  });

  test("reads the booth Wi-Fi credentials, colons unescaped", async () => {
    const { deps } = fakeNmcli({
      "-s -t -g": "DitherBooth-AB12\nab\\:cd2345\n",
    });

    expect(await getBoothWifiCredentials(deps)).toEqual({
      password: "ab:cd2345",
      ssid: "DitherBooth-AB12",
    });
  });
});
