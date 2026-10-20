import { HOTSPOT_IP } from "@dither-booth/shared/server/network";

import { renderCaptivePage } from "./captive.page";
import { renderDeviceSetupPage } from "./device-setup.page";

export const DEVICE_SETUP_CA_PATH = "/dither-booth-ca.crt";
export const CAPTIVE_PAGE_PATH = "/wifi";

export type CaptiveStatus = {
  state: "pick-network" | "booth-wifi-chosen" | "not-on-booth-wifi";
  nearby: Array<{ ssid: string; signal: number; secured: boolean }>;
};

/** The engine's `captive.*` procedures, called with the setup server's token. */
export type CaptiveBackend = {
  getStatus: () => Promise<CaptiveStatus>;
  join: (input: { ssid: string; password?: string }) => Promise<void>;
};

export type DeviceSetupRoutesOptions = {
  /** The booth CA's public certificate. Never its key. */
  caPath: string;
  shutterOrigins: string[];
  adminOrigin: string;
  darkroomPath: string;
  captive: CaptiveBackend;
};

/** The booth Wi-Fi's own subnet (NetworkManager's shared mode). */
const BOOTH_WIFI_CLIENT = new RegExp(
  `^(::ffff:)?${HOTSPOT_IP.split(".").slice(0, 3).join("\\.")}\\.\\d{1,3}$`,
);

/**
 * What each OS expects from its captive check when the Wi-Fi is open, so it
 * doesn't show a login sheet. Keyed by the host it asks.
 */
const CAPTIVE_CHECK_SUCCESS: Record<string, () => Response> = {
  "captive.apple.com": () => appleSuccess(),
  "www.apple.com": () => appleSuccess(),
  "www.appleiphonecell.com": () => appleSuccess(),
  "www.itools.info": () => appleSuccess(),
  "www.ibook.info": () => appleSuccess(),
  "www.airport.us": () => appleSuccess(),
  "www.thinkdifferent.us": () => appleSuccess(),
  "connectivitycheck.gstatic.com": () => new Response(null, { status: 204 }),
  "connectivitycheck.android.com": () => new Response(null, { status: 204 }),
  "clients3.google.com": () => new Response(null, { status: 204 }),
  "www.msftconnecttest.com": () => new Response("Microsoft Connect Test"),
  "www.msftncsi.com": () => new Response("Microsoft NCSI"),
  "detectportal.firefox.com": () => new Response("success\n"),
};

const appleSuccess = () =>
  new Response(
    "<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>",
    { headers: { "content-type": "text/html" } },
  );

const noStore = { "cache-control": "no-store" };

const errorMessage = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : "Something went wrong. Try again.";

/**
 * Plain HTTP on purpose: a device can't open the HTTPS apps until it trusts
 * the booth CA, so this is where it gets it. Hands out only the CA's public
 * certificate and links to the apps.
 *
 * On the booth Wi-Fi it is also the captive page: phones and laptops that
 * join it get the Wi-Fi picker on their own while the booth has no network.
 */
export function createDeviceSetupFetch(options: DeviceSetupRoutesOptions) {
  const page = renderDeviceSetupPage({
    adminOrigin: options.adminOrigin,
    caDownloadPath: DEVICE_SETUP_CA_PATH,
    darkroomPath: options.darkroomPath,
    shutterOrigins: options.shutterOrigins,
  });
  const captivePage = renderCaptivePage();

  const handleCaptiveCheck = async (
    succeed: () => Response,
    onBoothWifi: boolean,
  ) => {
    const status = onBoothWifi
      ? await options.captive.getStatus().catch(() => undefined)
      : undefined;

    return status?.state === "pick-network"
      ? new Response(null, {
          status: 302,
          headers: {
            ...noStore,
            location: `http://${HOTSPOT_IP}${CAPTIVE_PAGE_PATH}`,
          },
        })
      : succeed();
  };

  const handleCaptivePage = async (request: Request, pathname: string) => {
    if (pathname === CAPTIVE_PAGE_PATH) {
      return new Response(captivePage, {
        headers: { ...noStore, "content-type": "text/html; charset=utf-8" },
      });
    }

    if (pathname === `${CAPTIVE_PAGE_PATH}/status`) {
      return Response.json(await options.captive.getStatus(), {
        headers: noStore,
      });
    }

    // JSON only: another site's page can't send it without a preflight,
    // which nothing here answers.
    if (
      request.method !== "POST" ||
      !request.headers.get("content-type")?.startsWith("application/json")
    ) {
      return new Response(null, { status: 405 });
    }

    try {
      if (pathname === `${CAPTIVE_PAGE_PATH}/join`) {
        const body = (await request.json()) as {
          ssid?: unknown;
          password?: unknown;
        };
        await options.captive.join({
          password:
            typeof body.password === "string" ? body.password : undefined,
          ssid: typeof body.ssid === "string" ? body.ssid : "",
        });
      } else {
        return new Response(null, { status: 404 });
      }
      return Response.json({ ok: true });
    } catch (error) {
      return Response.json({ error: errorMessage(error) }, { status: 400 });
    }
  };

  return async (request: Request, clientIp?: string) => {
    const { hostname, pathname } = new URL(request.url);
    const onBoothWifi =
      clientIp !== undefined && BOOTH_WIFI_CLIENT.test(clientIp);
    const captiveCheck = CAPTIVE_CHECK_SUCCESS[hostname];

    if (captiveCheck) {
      return handleCaptiveCheck(captiveCheck, onBoothWifi);
    }

    if (
      pathname === CAPTIVE_PAGE_PATH ||
      pathname.startsWith(`${CAPTIVE_PAGE_PATH}/`)
    ) {
      // The picker changes the booth's network: only from its own Wi-Fi.
      return onBoothWifi
        ? handleCaptivePage(request, pathname)
        : new Response(null, { status: 302, headers: { location: "/" } });
    }

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
        headers: { ...noStore, "content-type": "text/html; charset=utf-8" },
      });
    }

    return new Response(null, { status: 302, headers: { location: "/" } });
  };
}

export function runDeviceSetupServer(
  options: DeviceSetupRoutesOptions & { bindHost: string; port: number },
) {
  const handle = createDeviceSetupFetch(options);
  const server = Bun.serve({
    hostname: options.bindHost,
    port: options.port,
    fetch: (request, bunServer) =>
      handle(request, bunServer.requestIP(request)?.address),
  });

  return { close: () => server.stop() };
}
