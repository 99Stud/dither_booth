import type { EngineOutputs } from "@dither-booth/engine/router.types";

import { BOOTH_WIFI_IP } from "@dither-booth/ports";
import {
  CAPTIVE_CHECKS,
  isBoothWifiClient,
  type CaptiveCheckReply,
} from "@dither-booth/shared/server/network";

import { renderCaptivePage } from "./captive.page";
import { renderDeviceSetupPage } from "./device-setup.page";

export const DEVICE_SETUP_CA_PATH = "/dither-booth-ca.crt";
export const CAPTIVE_PAGE_PATH = "/wifi";

export type CaptiveStatus = EngineOutputs["captive"]["getCaptiveStatus"];

/** The engine's `captive.*` procedures, called with the setup server's token. */
export type CaptiveBackend = {
  getStatus: () => Promise<CaptiveStatus>;
  /** Throws the engine's refusal, a wrong staff PIN included. */
  join: (input: {
    ssid: string;
    password?: string;
    pin: string;
  }) => Promise<void>;
};

export type DeviceSetupRoutesOptions = {
  /** The booth CA's public certificate. Never its key. */
  caPath: string;
  shutterOrigins: string[];
  adminOrigin: string;
  darkroomPath: string;
  captive: CaptiveBackend;
};

const captiveCheckSuccess = (reply: CaptiveCheckReply) =>
  new Response(reply.body ?? null, {
    headers: reply.contentType ? { "content-type": reply.contentType } : {},
    status: reply.status,
  });

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
    reply: CaptiveCheckReply,
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
            location: `http://${BOOTH_WIFI_IP}${CAPTIVE_PAGE_PATH}`,
          },
        })
      : captiveCheckSuccess(reply);
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
          pin?: unknown;
        };
        await options.captive.join({
          password:
            typeof body.password === "string" ? body.password : undefined,
          pin: typeof body.pin === "string" ? body.pin : "",
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
    const onBoothWifi = isBoothWifiClient(clientIp);
    const captiveCheck = CAPTIVE_CHECKS[hostname];

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
