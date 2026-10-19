import { renderDeviceSetupPage } from "./device-setup.page";

export const DEVICE_SETUP_CA_PATH = "/dither-booth-ca.crt";

export type DeviceSetupRoutesOptions = {
  /** The booth CA's public certificate. Never its key. */
  caPath: string;
  shutterOrigins: string[];
  adminOrigin: string;
  darkroomPath: string;
};

/**
 * Plain HTTP on purpose: a device can't open the HTTPS apps until it trusts
 * the booth CA, so this is where it gets it. Hands out only the CA's public
 * certificate and links to the apps.
 */
export function createDeviceSetupFetch(options: DeviceSetupRoutesOptions) {
  const page = renderDeviceSetupPage({
    adminOrigin: options.adminOrigin,
    caDownloadPath: DEVICE_SETUP_CA_PATH,
    darkroomPath: options.darkroomPath,
    shutterOrigins: options.shutterOrigins,
  });

  return (request: Request) => {
    const { pathname } = new URL(request.url);

    if (pathname === DEVICE_SETUP_CA_PATH) {
      return new Response(Bun.file(options.caPath), {
        headers: {
          // iOS installs a CA served with this type as a profile.
          "content-type": "application/x-x509-ca-cert",
          "content-disposition": 'attachment; filename="dither-booth-ca.crt"',
        },
      });
    }

    if (pathname === "/healthz") {
      return Response.json({ ok: true });
    }

    if (pathname === "/") {
      return new Response(page, {
        headers: {
          "cache-control": "no-store",
          "content-type": "text/html; charset=utf-8",
        },
      });
    }

    return new Response(null, { status: 302, headers: { location: "/" } });
  };
}

export function runDeviceSetupServer(
  options: DeviceSetupRoutesOptions & { bindHost: string; port: number },
) {
  const server = Bun.serve({
    hostname: options.bindHost,
    port: options.port,
    fetch: createDeviceSetupFetch(options),
  });

  return { close: () => server.stop() };
}
