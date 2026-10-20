import type { WifiNetwork } from "@dither-booth/shared/server/network";

import type { NetworkDeps } from "#domains/network/network.service";

import {
  getNetworkStatus,
  saveWifiNetwork,
} from "#domains/network/network.service";

/**
 * What a device on the booth Wi-Fi gets from its captive page: the Wi-Fi
 * picker only while the booth opened its Wi-Fi because no known network was
 * around. When staff chose to run the event on it, the page stays away.
 */
export type CaptiveStatus = {
  state: "pick-network" | "booth-wifi-chosen" | "not-on-booth-wifi";
  nearby: WifiNetwork[];
};

export async function getCaptiveStatus(
  deps: NetworkDeps,
): Promise<CaptiveStatus> {
  const status = await getNetworkStatus(deps);

  if (!status.available || status.mode !== "hotspot") {
    return { nearby: [], state: "not-on-booth-wifi" };
  }
  if (status.boothWifiChosen) {
    return { nearby: [], state: "booth-wifi-chosen" };
  }
  return { nearby: status.nearby, state: "pick-network" };
}

/**
 * Why the captive page can't join this network, if it can't. Only while the
 * booth is on its own Wi-Fi for want of a network: during an event on the
 * booth Wi-Fi, a guest who joined it can't move the booth.
 */
export function refuseCaptiveJoin(
  status: CaptiveStatus,
  input: { ssid: string; password?: string },
): string | undefined {
  if (status.state !== "pick-network") {
    return "The booth isn't waiting for a network.";
  }
  // Saved without one, a protected network fails to join with nothing that
  // says why. Only a network the scan saw as open goes without.
  if (
    !input.password &&
    !status.nearby.some(
      (network) => network.ssid === input.ssid && !network.secured,
    )
  ) {
    return `${input.ssid} needs its password.`;
  }
  return undefined;
}

export async function joinFromCaptive(
  deps: NetworkDeps,
  input: { ssid: string; password?: string },
): Promise<void> {
  const refusal = refuseCaptiveJoin(await getCaptiveStatus(deps), input);

  if (refusal) throw new Error(refusal);
  await saveWifiNetwork(deps, { ...input, connectNow: true });
}
