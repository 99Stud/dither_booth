import {
  BOOT_MARKER_PATH,
  HOTSPOT_CONNECTION_NAME,
  HOTSPOT_IP,
  NETWORK_STATE_DIR,
  PREFER_HOTSPOT_PATH,
  WIFI_SCAN_CACHE_PATH,
  getNetworkMode,
  isConnecting,
  isHotspotActive,
  parseNmcliDevices,
  parseNmcliWifiList,
} from "@dither-booth/shared/server/network";
import { defineCommand } from "citty";
import { randomInt } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { hostname, uptime } from "node:os";

import { requireRoot } from "#internal/args";
import { BOOTH_BIN, SERVICE_USER } from "#internal/config";
import {
  INITIAL_WATCH_STATE,
  decideNetworkAction,
  parseBusctlString,
  shouldReclaimMdnsName,
  type WatchState,
} from "#internal/network-watch";
import { capture, chownToServiceUser, run } from "#internal/system";
import { heading, info, ok, runBoothTask, step } from "#internal/ui";

const NETWORK_SERVICE_NAME = "ditherbooth-network.service";
const NETWORK_SERVICE_PATH = `/etc/systemd/system/${NETWORK_SERVICE_NAME}`;
const POLKIT_RULE_PATH = "/etc/polkit-1/rules.d/50-ditherbooth-network.rules";
const TICK_MS = 10_000;
/** A boot that lasts less than this counts towards the double power-cycle. */
const EARLY_BOOT_S = 120;
// No 0/O, 1/l/I: staff may have to type it off the ticket.
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

const nmcli = (args: string[]) =>
  capture(["nmcli", ...args], { allowFailure: true });

async function readDevices() {
  const result = await nmcli([
    "-t",
    "-f",
    "DEVICE,TYPE,STATE,CONNECTION",
    "device",
  ]);
  return parseNmcliDevices(result.stdout);
}

async function wifiDevice() {
  return (await readDevices()).find((device) => device.type === "wifi")?.device;
}

const generatePassword = () =>
  Array.from(
    { length: 10 },
    () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)],
  ).join("");

// ---- setup -----------------------------------------------------------------

function buildNetworkUnit(): string {
  return `[Unit]
Description=Dither Booth network fallback: its own Wi-Fi when no network is around
After=NetworkManager.service
Wants=NetworkManager.service

[Service]
Type=simple
ExecStart=${BOOTH_BIN} network watch --no-banner --color=never
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;
}

/** Lets the engine save and join networks as the service user, nothing wider. */
function buildPolkitRule(): string {
  return `// Installed by \`booth network setup\`.
polkit.addRule(function (action, subject) {
  if (
    subject.user === "${SERVICE_USER}" &&
    (action.id === "org.freedesktop.NetworkManager.settings.modify.system" ||
      action.id === "org.freedesktop.NetworkManager.network-control" ||
      action.id === "org.freedesktop.NetworkManager.wifi.scan")
  ) {
    return polkit.Result.YES;
  }
});
`;
}

async function ensureHotspotProfile(): Promise<void> {
  const existing = await nmcli(["-t", "-f", "NAME", "connection", "show"]);

  if (existing.stdout.split("\n").includes(HOTSPOT_CONNECTION_NAME)) {
    info("Booth Wi-Fi already set up; keeping its name and password.");
    return;
  }

  const device = await wifiDevice();

  if (!device) {
    info("No Wi-Fi adapter found; skipping the booth Wi-Fi.");
    return;
  }

  const mac = await Bun.file(`/sys/class/net/${device}/address`)
    .text()
    .catch(() => "");
  const suffix = mac.replaceAll(":", "").trim().slice(-4).toUpperCase();
  const ssid = suffix ? `DitherBooth-${suffix}` : "DitherBooth";

  step(`Creating the booth Wi-Fi ${ssid}`);
  await run([
    "nmcli",
    "connection",
    "add",
    "type",
    "wifi",
    "ifname",
    device,
    "con-name",
    HOTSPOT_CONNECTION_NAME,
    "autoconnect",
    "no",
    "ssid",
    ssid,
    "802-11-wireless.mode",
    "ap",
    "802-11-wireless.band",
    "bg",
    "ipv4.method",
    "shared",
    "ipv4.addresses",
    `${HOTSPOT_IP}/24`,
    "wifi-sec.key-mgmt",
    "wpa-psk",
    "wifi-sec.psk",
    generatePassword(),
  ]);
}

export async function runNetworkSetupCommand(): Promise<void> {
  heading("Set up the booth network fallback");

  step(`Creating ${NETWORK_STATE_DIR}`);
  await mkdir(NETWORK_STATE_DIR, { recursive: true });
  await chownToServiceUser(NETWORK_STATE_DIR);

  await ensureHotspotProfile();

  step(`Writing ${POLKIT_RULE_PATH}`);
  await Bun.write(POLKIT_RULE_PATH, buildPolkitRule());

  step(`Writing ${NETWORK_SERVICE_PATH}`);
  await Bun.write(NETWORK_SERVICE_PATH, buildNetworkUnit());
  await run(["systemctl", "daemon-reload"]);
  await run(["systemctl", "enable", "--now", NETWORK_SERVICE_NAME]);
  // A running watch keeps the old unit until restarted.
  await run(["systemctl", "restart", NETWORK_SERVICE_NAME]);

  ok(`${NETWORK_SERVICE_NAME} enabled`);
}

// ---- watch -----------------------------------------------------------------

async function countStations(device: string | undefined): Promise<number> {
  if (!device) return 0;
  const result = await capture(["iw", "dev", device, "station", "dump"], {
    allowFailure: true,
  });
  return result.stdout.split("\n").filter((line) => line.startsWith("Station"))
    .length;
}

async function startHotspot(): Promise<void> {
  // AP mode takes the only radio: remember what's around for the Darkroom.
  const scan = await nmcli([
    "-t",
    "-f",
    "SSID,SIGNAL,SECURITY,IN-USE",
    "device",
    "wifi",
    "list",
    "--rescan",
    "yes",
  ]);
  await Bun.write(
    WIFI_SCAN_CACHE_PATH,
    JSON.stringify(parseNmcliWifiList(scan.stdout)),
  );
  await chownToServiceUser(WIFI_SCAN_CACHE_PATH);
  console.log("[network] no network: starting the booth Wi-Fi");
  await nmcli(["connection", "up", HOTSPOT_CONNECTION_NAME]);
}

/**
 * Two power-cycles within two minutes force the booth Wi-Fi: the way out of
 * a venue network the iPad can't reach the booth on, without a screen.
 */
async function consumeEarlyBootMarker(): Promise<boolean> {
  // Only a fresh boot counts; a watch restart later on doesn't.
  if (uptime() > EARLY_BOOT_S) return false;

  const forced = await Bun.file(BOOT_MARKER_PATH).exists();
  await Bun.write(BOOT_MARKER_PATH, "");
  setTimeout(
    () => void rm(BOOT_MARKER_PATH, { force: true }),
    (EARLY_BOOT_S - uptime()) * 1000,
  );
  return forced;
}

async function readAvahiHostName(): Promise<string | null> {
  const result = await capture(
    [
      "busctl",
      "--system",
      "call",
      "org.freedesktop.Avahi",
      "/",
      "org.freedesktop.Avahi.Server",
      "GetHostName",
    ],
    { allowFailure: true },
  );
  return parseBusctlString(result.stdout);
}

export async function runNetworkWatch(): Promise<void> {
  await mkdir(NETWORK_STATE_DIR, { recursive: true });

  let forced = await consumeEarlyBootMarker();
  let state: WatchState = INITIAL_WATCH_STATE;
  let mdnsRestartAt: number | null = null;
  const machineName = hostname().split(".")[0] ?? hostname();

  if (forced)
    console.log("[network] double power-cycle: forcing the booth Wi-Fi");

  for (;;) {
    const devices = await readDevices();
    const mode = getNetworkMode(devices);
    const hotspotActive = isHotspotActive(devices);
    const online = mode === "wifi" || mode === "ethernet";

    // Staff joined a network from the Darkroom: the forced hotspot is over.
    if (forced && online && !hotspotActive) forced = false;

    const result = decideNetworkAction(
      {
        connecting: isConnecting(devices),
        holdHotspot: forced || (await Bun.file(PREFER_HOTSPOT_PATH).exists()),
        hotspotActive,
        now: Date.now(),
        online,
        stations: hotspotActive ? await countStations(await wifiDevice()) : 0,
      },
      state,
    );
    state = result.state;

    if (result.action === "start-hotspot") {
      await startHotspot();
    } else if (result.action === "retry-saved-networks") {
      console.log("[network] booth Wi-Fi idle: trying saved networks");
      await nmcli(["connection", "down", HOTSPOT_CONNECTION_NAME]);
    }

    const avahiName = await readAvahiHostName();

    if (
      shouldReclaimMdnsName({
        avahiName,
        hostname: machineName,
        lastRestartAt: mdnsRestartAt,
        now: Date.now(),
      })
    ) {
      console.log(
        `[network] avahi renamed the booth ${avahiName}.local: taking ${machineName}.local back`,
      );
      mdnsRestartAt = Date.now();
      await run(["systemctl", "restart", "avahi-daemon"], {
        allowFailure: true,
      });
    }

    await Bun.sleep(TICK_MS);
  }
}

const setupCommand = defineCommand({
  meta: {
    name: "setup",
    description:
      "Create the booth Wi-Fi, the polkit rule and the network watch service",
  },
  async setup() {
    requireRoot("network setup");
  },
  async run() {
    await runBoothTask(runNetworkSetupCommand);
  },
});

const watchCommand = defineCommand({
  meta: {
    name: "watch",
    description:
      "Open the booth Wi-Fi when no network is around (run by systemd)",
  },
  async setup() {
    requireRoot("network watch");
  },
  async run() {
    await runNetworkWatch();
  },
});

export default defineCommand({
  meta: {
    name: "network",
    description: "The booth's own Wi-Fi, for venues it doesn't know yet",
  },
  default: "setup",
  subCommands: {
    setup: setupCommand,
    watch: watchCommand,
  },
});
