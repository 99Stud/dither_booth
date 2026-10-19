import { describe, expect, test } from "bun:test";

import type { Nmcli } from "./network.nmcli";

import {
  describeJoinFailure,
  forgetWifiNetwork,
  refuseCaptiveJoin,
  getBoothWifiCredentials,
  getNetworkStatus,
  saveWifiNetwork,
  type JoinFailure,
  type NetworkDeps,
} from "./network.service";

/** Answers nmcli calls by their joined arguments and records every call. */
function fakeNmcli(
  answers: Record<string, string> = {},
  /** Calls that fail, by their joined arguments, with nmcli's error. */
  failures: Record<string, string> = {},
) {
  const calls: string[][] = [];
  const nmcli: Nmcli = async (args) => {
    calls.push(args);
    const key = args.join(" ");
    const failure = failures[key];
    if (failure) return { exitCode: 4, stderr: failure, stdout: "" };
    const stdout = Object.entries(answers).find(([prefix]) =>
      key.startsWith(prefix),
    )?.[1];
    return { exitCode: 0, stderr: "", stdout: stdout ?? "" };
  };
  const scheduled: Array<() => Promise<unknown>> = [];
  const joinFailures: JoinFailure[] = [];
  const deps: NetworkDeps = {
    later: (task) => {
      scheduled.push(task);
    },
    nmcli,
    onJoinFailed: async (failure) => {
      joinFailures.push(failure);
    },
  };
  return { calls, deps, joinFailures, scheduled };
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
      onJoinFailed: async () => {},
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
      "-t -f",
    ]);
    expect(calls[1]).toContain("venue-pass");
    expect(scheduled).toHaveLength(1);
    await scheduled[0]?.();
    expect(calls.at(-1)).toEqual(["connection", "up", "id", "Venue"]);
  });

  test("a failed join from the booth Wi-Fi goes back to it and says why", async () => {
    const { calls, deps, joinFailures, scheduled } = fakeNmcli(
      {
        "-t -f DEVICE,TYPE,STATE,CONNECTION device":
          "wlan0:wifi:connected:booth-hotspot\n",
      },
      {
        "connection up id Venue":
          "Error: Connection activation failed: Secrets were required, but not provided.",
      },
    );

    await saveWifiNetwork(deps, {
      connectNow: true,
      password: "wrong-pass",
      ssid: "Venue",
    });
    await scheduled[0]?.();

    expect(calls.at(-1)).toEqual(["connection", "up", "id", "booth-hotspot"]);
    expect(joinFailures).toEqual([
      {
        backOnBoothWifi: true,
        nmcliError:
          "Error: Connection activation failed: Secrets were required, but not provided.",
        reason: "Wrong password.",
        ssid: "Venue",
      },
    ]);
  });

  test("puts nmcli's errors in words staff can act on", () => {
    expect(
      describeJoinFailure("Error: No network with SSID 'Venue' found."),
    ).toBe("Not in range.");
    expect(
      describeJoinFailure(
        "Error: Connection activation failed: The Wi-Fi network could not be found.",
      ),
    ).toBe("Not in range.");
    expect(describeJoinFailure("Error: something else")).toBe(
      "The network didn't accept the booth.",
    );
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
  });
});
