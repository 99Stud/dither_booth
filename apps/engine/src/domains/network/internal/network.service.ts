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

export type JoinFailure = {
  ssid: string;
  /** For staff, on the ticket: "Wrong password." */
  reason: string;
  /** The booth was on its own Wi-Fi and went back to it. */
  backOnBoothWifi: boolean;
};

export type NetworkDeps = {
  nmcli: Nmcli;
  /** Runs `task` after `delayMs`, without waiting for it. */
  later: (task: () => Promise<unknown>, delayMs: number) => void;
  /**
   * A switch staff asked for failed. The device that asked has usually lost
   * the booth by then, so this is how they hear about it: a ticket.
   */
  onJoinFailed: (failure: JoinFailure) => Promise<void>;
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

async function readSsid(deps: Pick<NetworkDeps, "nmcli">, connection: string) {
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

/**
 * What the booth is on, without scanning: cheap enough for every ticket.
 * Undefined without NetworkManager.
 */
export async function readConnection(deps: Pick<NetworkDeps, "nmcli">) {
  const result = await deps
    .nmcli(["-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device"])
    .catch(() => undefined);

  if (result?.exitCode !== 0) return undefined;

  const devices = parseNmcliDevices(result.stdout);
  const wifi = devices.find(
    (device) => device.type === "wifi" && device.state.startsWith("connected"),
  );

  return {
    mode: getNetworkMode(devices),
    ssid: wifi ? await readSsid(deps, wifi.connection) : null,
  };
}

/** nmcli's error, in words staff can act on. */
export function describeJoinFailure(stderr: string): string {
  if (/secrets were required|802-1x supplicant|psk/i.test(stderr)) {
    return "Wrong password.";
  }
  if (/no network with ssid|not found/i.test(stderr)) {
    return "Not in range.";
  }
  if (/ip configuration could not be reserved|dhcp/i.test(stderr)) {
    return "The network gave the booth no address.";
  }
  return "The network didn't accept the booth.";
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
    const fromBoothWifi = (await readConnection(deps))?.mode === "hotspot";

    await rm(PREFER_HOTSPOT_PATH, { force: true });
    deps.later(
      () => joinNetwork(deps, input.ssid, fromBoothWifi),
      NETWORK_SWITCH_DELAY_MS,
    );
  }
}

/**
 * On success the booth gets a new address and prints a setup ticket for it.
 * On failure it goes straight back to its own Wi-Fi, rather than after the
 * watch's 45 s offline, and prints why.
 */
async function joinNetwork(
  deps: NetworkDeps,
  ssid: string,
  fromBoothWifi: boolean,
) {
  const result = await deps.nmcli(["connection", "up", "id", ssid]);

  if (result.exitCode === 0) return;

  if (fromBoothWifi) {
    await deps.nmcli(["connection", "up", "id", HOTSPOT_CONNECTION_NAME]);
  }
  await deps.onJoinFailed({
    backOnBoothWifi: fromBoothWifi,
    reason: describeJoinFailure(result.stderr),
    ssid,
  });
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
    // Already on it: bringing it up again would drop every device on it.
    if ((await readConnection(deps))?.mode === "hotspot") return;
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
