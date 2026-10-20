import { BOOTH_WIFI_IP } from "@dither-booth/ports";
import { BlockList } from "node:net";

/**
 * The booth's own Wi-Fi, and the files the network watch (root) and the
 * engine (service user) share. NetworkManager owns the networks themselves.
 */
export const HOTSPOT_CONNECTION_NAME = "booth-hotspot";
/** NetworkManager's shared mode hands the booth Wi-Fi's devices a /24. */
export const BOOTH_WIFI_PREFIX_LENGTH = 24;

const boothWifiClients = new BlockList();
boothWifiClients.addSubnet(BOOTH_WIFI_IP, BOOTH_WIFI_PREFIX_LENGTH, "ipv4");

/** A device on the booth's own Wi-Fi, IPv4-mapped IPv6 included. */
export const isBoothWifiClient = (address: string | undefined) =>
  !!address &&
  boothWifiClients.check(address, address.includes(":") ? "ipv6" : "ipv4");

/** Owned by the service user, so the engine can write what the watch reads. */
export const NETWORK_STATE_DIR = "/var/lib/ditherbooth";
/** Present while staff chose to run the event on the booth's own Wi-Fi. */
export const PREFER_HOTSPOT_PATH = `${NETWORK_STATE_DIR}/prefer-hotspot`;
/** Networks seen before the hotspot took the radio, which can't scan from AP mode. */
export const WIFI_SCAN_CACHE_PATH = `${NETWORK_STATE_DIR}/wifi-scan.json`;
/** Left by a boot that didn't last two minutes: the next one forces the hotspot. */
export const BOOT_MARKER_PATH = `${NETWORK_STATE_DIR}/early-boot`;

/** What a captive check expects back when the Wi-Fi needs no login page. */
export type CaptiveCheckReply = {
  status: number;
  body?: string;
  contentType?: string;
};

const APPLE_SUCCESS: CaptiveCheckReply = {
  body: "<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>",
  contentType: "text/html",
  status: 200,
};
const NO_CONTENT: CaptiveCheckReply = { status: 204 };

/**
 * Hosts phones and laptops fetch over plain HTTP to tell whether a Wi-Fi
 * needs a login page, with the reply that says it doesn't. On the booth
 * Wi-Fi they resolve to the booth (dnsmasq), which answers with the Wi-Fi
 * picker instead while it has no network to join. Only these hosts: the
 * rest of the internet still resolves, for a booth with an Ethernet uplink.
 */
export const CAPTIVE_CHECKS: Record<string, CaptiveCheckReply> = {
  // iOS, iPadOS, macOS
  "captive.apple.com": APPLE_SUCCESS,
  "www.apple.com": APPLE_SUCCESS,
  "www.appleiphonecell.com": APPLE_SUCCESS,
  "www.itools.info": APPLE_SUCCESS,
  "www.ibook.info": APPLE_SUCCESS,
  "www.airport.us": APPLE_SUCCESS,
  "www.thinkdifferent.us": APPLE_SUCCESS,
  // Android
  "connectivitycheck.gstatic.com": NO_CONTENT,
  "connectivitycheck.android.com": NO_CONTENT,
  "clients3.google.com": NO_CONTENT,
  // Windows
  "www.msftconnecttest.com": { body: "Microsoft Connect Test", status: 200 },
  "www.msftncsi.com": { body: "Microsoft NCSI", status: 200 },
  // Firefox
  "detectportal.firefox.com": { body: "success\n", status: 200 },
};

/** Where the setup server sends the booth Wi-Fi's captive page requests. */
export const CAPTIVE_HTTP_PORT = 80;

/** Opens the engine's `captive.*` procedures; only the setup server has it. */
export const SETUP_SERVER_TOKEN_HEADER = "x-setup-server-token";

export type NmcliDevice = {
  device: string;
  type: string;
  state: string;
  connection: string;
};

export type WifiNetwork = {
  ssid: string;
  /** 0–100. */
  signal: number;
  /** Open networks need no password. */
  secured: boolean;
  inUse: boolean;
};

/** Splits one `nmcli -t` line on the colons it didn't escape. */
export function splitNmcliTerse(line: string): string[] {
  const fields: string[] = [];
  let current = "";

  for (let index = 0; index < line.length; index++) {
    const char = line[index];

    if (char === "\\" && index + 1 < line.length) {
      current += line[index + 1];
      index++;
    } else if (char === ":") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields;
}

const lines = (output: string) =>
  output.split("\n").filter((line) => line.trim().length > 0);

/** `nmcli -t -f DEVICE,TYPE,STATE,CONNECTION device` */
export function parseNmcliDevices(output: string): NmcliDevice[] {
  return lines(output).map((line) => {
    const [device = "", type = "", state = "", connection = ""] =
      splitNmcliTerse(line);
    return { connection, device, state, type };
  });
}

/** `nmcli -t -f SSID,SIGNAL,SECURITY,IN-USE device wifi list`, strongest first, one row per SSID. */
export function parseNmcliWifiList(output: string): WifiNetwork[] {
  const bySsid = new Map<string, WifiNetwork>();

  for (const line of lines(output)) {
    const [ssid = "", signal = "0", security = "", inUse = ""] =
      splitNmcliTerse(line);
    // Hidden networks have no name to pick.
    if (!ssid) continue;

    const network: WifiNetwork = {
      inUse: inUse.trim() === "*",
      secured: security.trim() !== "" && security.trim() !== "--",
      signal: Number(signal) || 0,
      ssid,
    };
    const seen = bySsid.get(ssid);

    if (!seen || network.signal > seen.signal || network.inUse) {
      bySsid.set(ssid, { ...network, inUse: network.inUse || !!seen?.inUse });
    }
  }

  return [...bySsid.values()].sort((a, b) => b.signal - a.signal);
}

const isUp = (device: NmcliDevice) => device.state.startsWith("connected");

/** The booth's own Wi-Fi is up, possibly next to an Ethernet uplink. */
export const isHotspotActive = (devices: NmcliDevice[]) =>
  devices.some(
    (device) =>
      device.type === "wifi" &&
      isUp(device) &&
      device.connection === HOTSPOT_CONNECTION_NAME,
  );

/** NetworkManager is in the middle of joining a network: leave it to it. */
export const isConnecting = (devices: NmcliDevice[]) =>
  devices.some(
    (device) =>
      (device.type === "wifi" || device.type === "ethernet") &&
      device.state.startsWith("connecting"),
  );

/**
 * What the booth is on: a network someone else runs (Wi-Fi or Ethernet), its
 * own hotspot, or nothing.
 */
export function getNetworkMode(
  devices: NmcliDevice[],
): "wifi" | "ethernet" | "hotspot" | "offline" {
  const up = devices.filter(isUp);

  if (up.some((device) => device.type === "ethernet")) return "ethernet";
  if (
    up.some(
      (device) =>
        device.type === "wifi" && device.connection === HOTSPOT_CONNECTION_NAME,
    )
  ) {
    return "hotspot";
  }
  if (up.some((device) => device.type === "wifi")) return "wifi";
  return "offline";
}
