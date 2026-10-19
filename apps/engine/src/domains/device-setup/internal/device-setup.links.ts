import {
  getLocalOrigins,
  getPort,
  getSetupOrigin,
  getShutterOrigin,
  getWebPublicIp,
} from "@dither-booth/ports";
import { DARKROOM_PATH } from "@dither-booth/shared/darkroom";

export type DeviceSetupLinks = {
  /** The booth's address on the network it's on now. */
  ip: string;
  /** Plain-HTTP page where a device trusts the booth CA. */
  setupUrl: string;
  /**
   * The same page at `<hostname>.local`, for a device that can't reach the
   * IP: one with no IPv4 route to the booth, as on an iPhone's hotspot.
   */
  localSetupUrl: string | null;
  /** The Shutter, most stable first: `.local` keeps working when the IP changes. */
  shutterUrls: string[];
  darkroomUrl: string;
};

export async function getDeviceSetupLinks(options: {
  repoRoot: string;
}): Promise<DeviceSetupLinks> {
  const [ip, setupUrl, shutterOrigin, localSetupUrls, localShutterUrls] =
    await Promise.all([
      getWebPublicIp(options),
      getSetupOrigin(options),
      getShutterOrigin(options),
      getLocalOrigins(options, {
        port: getPort("SETUP_PORT"),
        protocol: "http",
      }),
      getLocalOrigins(options, {
        port: getPort("SHUTTER_PORT"),
        protocol: "https",
      }),
    ]);
  const shutterUrls = [...localShutterUrls, shutterOrigin];

  return {
    darkroomUrl: new URL(DARKROOM_PATH, shutterUrls[0]).toString(),
    ip,
    localSetupUrl: localSetupUrls[0] ?? null,
    setupUrl,
    shutterUrls,
  };
}
