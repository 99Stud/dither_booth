import type { NetworkDeps } from "#domains/network/network.service";

import {
  getBoothWifiCredentials,
  readConnection,
} from "#domains/network/network.service";

import type { SetupTicket } from "./device-setup.auto-print";
import type { TicketOptions } from "./device-setup.ticket";

import { getDeviceSetupLinks } from "./device-setup.links";
import { buildBoothWifiTicket, buildSetupTicket } from "./device-setup.ticket";

/**
 * The ticket that gets a device in from where the booth is now: on its own
 * Wi-Fi, staff join that first; anywhere else, the setup page.
 */
export async function getCurrentSetupTicket(
  network: Pick<NetworkDeps, "nmcli">,
  options: { repoRoot: string } & TicketOptions,
): Promise<SetupTicket> {
  const [links, connection] = await Promise.all([
    getDeviceSetupLinks(options),
    readConnection(network),
  ]);
  const boothWifi =
    connection?.mode === "hotspot"
      ? await getBoothWifiCredentials(network)
      : undefined;

  if (boothWifi) {
    return {
      body: buildBoothWifiTicket(boothWifi, links, options),
      key: "booth-wifi",
    };
  }

  const networkName =
    connection?.ssid ?? (connection?.mode === "ethernet" ? "Ethernet" : null);

  return {
    body: buildSetupTicket(links, networkName, options),
    // A new network or a new address: print again.
    key: `${networkName ?? "unknown"}:${links.ip}`,
  };
}
