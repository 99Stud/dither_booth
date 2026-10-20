import { BOOTH_WIFI_IP } from "@dither-booth/ports";
import {
  CAPTIVE_CHECKS,
  CAPTIVE_HTTP_PORT,
} from "@dither-booth/shared/server/network";

/** NetworkManager's dnsmasq for shared connections (the booth Wi-Fi) reads this. */
export const CAPTIVE_DNSMASQ_PATH =
  "/etc/NetworkManager/dnsmasq-shared.d/ditherbooth-captive.conf";

/**
 * On the booth Wi-Fi, the hosts devices check for a login page resolve to the
 * booth, so the setup server can answer them.
 */
export function buildCaptiveDnsmasqConf(): string {
  return [
    "# Installed by `booth network setup`: devices that join the booth Wi-Fi",
    "# ask the booth whether it needs a login page.",
    ...Object.keys(CAPTIVE_CHECKS).map(
      (host) => `address=/${host}/${BOOTH_WIFI_IP}`,
    ),
    "",
  ].join("\n");
}

/**
 * Captive checks are plain HTTP on port 80, which only root can open: send
 * them to the setup server. The table is replaced whole, so running it again
 * changes nothing.
 */
export function buildCaptiveNftRules(setupPort: number): string {
  return `table ip ditherbooth
delete table ip ditherbooth
table ip ditherbooth {
  chain prerouting {
    type nat hook prerouting priority dstnat; policy accept;
    ip daddr ${BOOTH_WIFI_IP} tcp dport ${CAPTIVE_HTTP_PORT} redirect to :${setupPort}
  }
}
`;
}
