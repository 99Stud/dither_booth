import {
  getPort,
  getSetupOrigin,
  getShutterOrigin,
  getWebPublicIp,
  getWebTlsHostnames,
} from "@dither-booth/ports";
import { DARKROOM_PATH } from "@dither-booth/shared/darkroom";

export type DeviceSetupLinks = {
  /** The booth's address on the network it's on now. */
  ip: string;
  /** Plain-HTTP page where a device trusts the booth CA. */
  setupUrl: string;
  /** The Shutter, most stable first: `.local` keeps working when the IP changes. */
  shutterUrls: string[];
  darkroomUrl: string;
};

export async function getDeviceSetupLinks(options: {
  repoRoot: string;
}): Promise<DeviceSetupLinks> {
  const [ip, setupUrl, shutterOrigin, hostnames] = await Promise.all([
    getWebPublicIp(options),
    getSetupOrigin(options),
    getShutterOrigin(options),
    getWebTlsHostnames(options),
  ]);
  const shutterPort = getPort("SHUTTER_PORT");
  const shutterUrls = [
    ...hostnames
      .filter((hostname) => hostname.endsWith(".local"))
      .map((hostname) => `https://${hostname}:${shutterPort}`),
    shutterOrigin,
  ];

  return {
    darkroomUrl: new URL(DARKROOM_PATH, shutterUrls[0]).toString(),
    ip,
    setupUrl,
    shutterUrls,
  };
}
