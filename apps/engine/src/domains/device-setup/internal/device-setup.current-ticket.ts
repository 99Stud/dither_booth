import { BOOTH_WIFI_IP, getWebPublicIp } from "@dither-booth/ports";

import type { NetworkDeps } from "#domains/network/network.service";

import {
  getBoothWifiCredentials,
  readConnection,
} from "#domains/network/network.service";

import type { SetupTicket } from "./device-setup.auto-print";
import type { TicketOptions } from "./device-setup.ticket";

import { getDeviceSetupLinks } from "./device-setup.links";
import { buildBoothWifiTicket, buildSetupTicket } from "./device-setup.ticket";

/** The links for where the booth is now: its own Wi-Fi, or a venue network. */
export async function getCurrentDeviceSetupLinks(
  network: Pick<NetworkDeps, "nmcli">,
  options: { repoRoot: string },
) {
  const connection = await readConnection(network);

  // On the booth Wi-Fi the interface has its address: 10.42.0.1.
  return getDeviceSetupLinks({ ...options, ip: connection?.ip });
}

/**
 * The ticket that gets a device in from where the booth is now: on its own
 * Wi-Fi, staff join that first; anywhere else, the setup page. Undefined
 * while there's nothing to print yet: no network, or a new venue address
 * the booth is restarting for (it re-issues its certificate, then prints).
 */
export async function getCurrentSetupTicket(
  network: Pick<NetworkDeps, "nmcli">,
  options: {
    repoRoot: string;
    /** The booth is about to go back to its own Wi-Fi: ticket for that. */
    boothWifiNext?: boolean;
  } & TicketOptions,
): Promise<SetupTicket | undefined> {
  const connection = await readConnection(network);
  const onBoothWifi = options.boothWifiNext || connection?.mode === "hotspot";

  if (!onBoothWifi && connection?.mode === "offline") return undefined;

  if (onBoothWifi) {
    const [links, boothWifi] = await Promise.all([
      getDeviceSetupLinks({ ...options, ip: BOOTH_WIFI_IP }),
      getBoothWifiCredentials(network),
    ]);

    if (boothWifi) {
      return {
        build: () => buildBoothWifiTicket(boothWifi, links, options),
        key: "booth-wifi",
      };
    }
  }

  const certificateIp = await getWebPublicIp(options);
  const ip = connection?.ip;

  if (ip && ip !== BOOTH_WIFI_IP && ip !== certificateIp) return undefined;

  const links = await getDeviceSetupLinks({ ...options, ip });
  const networkName =
    connection?.ssid ?? (connection?.mode === "ethernet" ? "Ethernet" : null);

  return {
    build: () => buildSetupTicket(links, networkName, options),
    // A new network or a new address: print again.
    key: `${networkName ?? "unknown"}:${links.ip}`,
  };
}
