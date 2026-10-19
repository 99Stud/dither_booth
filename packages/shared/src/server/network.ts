/**
 * The booth's own Wi-Fi, and the files the network watch (root) and the
 * engine (service user) share. NetworkManager owns the networks themselves.
 */
export const HOTSPOT_CONNECTION_NAME = "booth-hotspot";
/** NetworkManager's address for a shared (`ipv4.method shared`) connection. */
export const HOTSPOT_IP = "10.42.0.1";

/** Owned by the service user, so the engine can write what the watch reads. */
export const NETWORK_STATE_DIR = "/var/lib/ditherbooth";
/** Present while staff chose to run the event on the booth's own Wi-Fi. */
export const PREFER_HOTSPOT_PATH = `${NETWORK_STATE_DIR}/prefer-hotspot`;
/** Networks seen before the hotspot took the radio, which can't scan from AP mode. */
export const WIFI_SCAN_CACHE_PATH = `${NETWORK_STATE_DIR}/wifi-scan.json`;
/** Left by a boot that didn't last two minutes: the next one forces the hotspot. */
export const BOOT_MARKER_PATH = `${NETWORK_STATE_DIR}/early-boot`;

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
