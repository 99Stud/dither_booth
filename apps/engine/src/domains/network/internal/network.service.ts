import {
  HOTSPOT_CONNECTION_NAME,
  PREFER_HOTSPOT_PATH,
  WIFI_SCAN_CACHE_PATH,
  getNetworkMode,
  isHotspotActive,
  parseNmcliDevices,
  parseNmcliWifiList,
  splitNmcliTerse,
  type WifiNetwork,
} from "@dither-booth/shared/server/network";
import { rm, writeFile } from "node:fs/promises";

import type { Nmcli } from "./network.nmcli";

/**
 * How long a switch waits before it happens: on the booth Wi-Fi, the radio
 * changing drops the iPad, so the answer has to reach it first.
 */
export const NETWORK_SWITCH_DELAY_MS = 1_500;

export type NetworkStatus =
  | { available: false }
  | {
      available: true;
      mode: ReturnType<typeof getNetworkMode>;
      /** The Wi-Fi the booth is on, booth Wi-Fi included. */
      ssid: string | null;
      /** Staff chose to run on the booth Wi-Fi. */
      boothWifiChosen: boolean;
      nearby: WifiNetwork[];
      /** Networks the booth joins on its own when it sees them. */
      saved: string[];
    };

export type NetworkDeps = {
  nmcli: Nmcli;
  /** Runs `task` after `delayMs`, without waiting for it. */
  later: (task: () => Promise<unknown>, delayMs: number) => void;
};

export const defaultLater: NetworkDeps["later"] = (task, delayMs) => {
  setTimeout(() => void task().catch(() => {}), delayMs);
};

async function nmcliOrThrow(deps: NetworkDeps, args: string[]) {
  const result = await deps.nmcli(args);

  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr.trim().replace(/^Error: /, "") ||
        `nmcli ${args[0]} failed.`,
    );
  }
  return result.stdout;
}

/** `nmcli -g` escapes colons and backslashes in a value. */
const unescapeValue = (value: string) => splitNmcliTerse(value).join(":");

async function readSsid(deps: NetworkDeps, connection: string) {
  const result = await deps.nmcli([
    "-t",
    "-g",
    "802-11-wireless.ssid",
    "connection",
    "show",
    "id",
    connection,
  ]);
  return unescapeValue(result.stdout.trim()) || connection;
}

async function readNearby(deps: NetworkDeps, onHotspot: boolean) {
  // In AP mode the radio can't scan: use what the watch saw before.
  if (onHotspot) {
    const cached = await Bun.file(WIFI_SCAN_CACHE_PATH)
      .json()
      .catch(() => []);
    return Array.isArray(cached) ? (cached as WifiNetwork[]) : [];
  }

  const result = await deps.nmcli([
    "-t",
    "-f",
    "SSID,SIGNAL,SECURITY,IN-USE",
    "device",
    "wifi",
    "list",
    "--rescan",
    "auto",
  ]);
  return parseNmcliWifiList(result.stdout);
}

/** Just the mode, without scanning: cheap enough for every engine start. */
export async function readNetworkMode(deps: Pick<NetworkDeps, "nmcli">) {
  const result = await deps
    .nmcli(["-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device"])
    .catch(() => undefined);

  return result?.exitCode === 0
    ? getNetworkMode(parseNmcliDevices(result.stdout))
    : undefined;
}

export async function getNetworkStatus(
  deps: NetworkDeps,
): Promise<NetworkStatus> {
  const devicesResult = await deps
    .nmcli(["-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device"])
    .catch(() => undefined);

  if (!devicesResult || devicesResult.exitCode !== 0) {
    return { available: false };
  }

  const devices = parseNmcliDevices(devicesResult.stdout);
  const onHotspot = isHotspotActive(devices);
  const wifi = devices.find(
    (device) => device.type === "wifi" && device.state.startsWith("connected"),
  );
  const [ssid, nearby, connections, boothWifiChosen] = await Promise.all([
    wifi ? readSsid(deps, wifi.connection) : null,
    readNearby(deps, onHotspot),
    deps.nmcli(["-t", "-f", "NAME,TYPE", "connection", "show"]),
    Bun.file(PREFER_HOTSPOT_PATH).exists(),
  ]);
  const saved = connections.stdout
    .split("\n")
    .map(splitNmcliTerse)
    .filter(
      ([name, type]) =>
        type === "802-11-wireless" && name && name !== HOTSPOT_CONNECTION_NAME,
    )
    .map(([name]) => name as string);

  return {
    available: true,
    boothWifiChosen,
    mode: getNetworkMode(devices),
    nearby,
    saved,
    ssid,
  };
}

/**
 * Saves a Wi-Fi network the booth then joins whenever it's around, so staff
 * can add the venue's network the day before. `connectNow` joins it straight
 * away and leaves the booth Wi-Fi.
 */
export async function saveWifiNetwork(
  deps: NetworkDeps,
  input: { ssid: string; password?: string; connectNow: boolean },
): Promise<void> {
  if (input.ssid === HOTSPOT_CONNECTION_NAME) {
    throw new Error("That name is taken by the booth Wi-Fi.");
  }

  // Replaces a saved network with the same name, e.g. a new password.
  await deps.nmcli(["connection", "delete", "id", input.ssid]);
  await nmcliOrThrow(deps, [
    "connection",
    "add",
    "type",
    "wifi",
    "con-name",
    input.ssid,
    "ssid",
    input.ssid,
    "connection.autoconnect",
    "yes",
    ...(input.password
      ? ["wifi-sec.key-mgmt", "wpa-psk", "wifi-sec.psk", input.password]
      : []),
  ]);

  if (input.connectNow) {
    await rm(PREFER_HOTSPOT_PATH, { force: true });
    deps.later(
      () => deps.nmcli(["connection", "up", "id", input.ssid]),
      NETWORK_SWITCH_DELAY_MS,
    );
  }
}

export async function forgetWifiNetwork(
  deps: NetworkDeps,
  input: { ssid: string },
): Promise<void> {
  if (input.ssid === HOTSPOT_CONNECTION_NAME) {
    throw new Error("The booth Wi-Fi can't be forgotten.");
  }
  await nmcliOrThrow(deps, ["connection", "delete", "id", input.ssid]);
}

/**
 * Runs the event on the booth's own Wi-Fi (venue Wi-Fi that keeps devices
 * apart, or none at all), or goes back to the saved networks.
 */
export async function setBoothWifi(
  deps: NetworkDeps,
  input: { enabled: boolean },
): Promise<void> {
  if (input.enabled) {
    await writeFile(PREFER_HOTSPOT_PATH, "");
    deps.later(
      () => deps.nmcli(["connection", "up", "id", HOTSPOT_CONNECTION_NAME]),
      NETWORK_SWITCH_DELAY_MS,
    );
    return;
  }

  await rm(PREFER_HOTSPOT_PATH, { force: true });
  deps.later(
    () => deps.nmcli(["connection", "down", "id", HOTSPOT_CONNECTION_NAME]),
    NETWORK_SWITCH_DELAY_MS,
  );
}

/** The booth Wi-Fi's name and password, for the ticket that lets staff join it. */
export async function getBoothWifiCredentials(
  deps: Pick<NetworkDeps, "nmcli">,
): Promise<{ ssid: string; password: string } | undefined> {
  const result = await deps
    .nmcli([
      "-s",
      "-t",
      "-g",
      "802-11-wireless.ssid,802-11-wireless-security.psk",
      "connection",
      "show",
      "id",
      HOTSPOT_CONNECTION_NAME,
    ])
    .catch(() => undefined);

  if (!result || result.exitCode !== 0) return undefined;

  const [ssid, password] = result.stdout
    .split("\n")
    .map((line) => unescapeValue(line.trim()));
  return ssid && password ? { password, ssid } : undefined;
}
