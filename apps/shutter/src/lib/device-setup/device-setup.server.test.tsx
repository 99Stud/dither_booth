import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DEVICE_SETUP_CA_PATH,
  createDeviceSetupFetch,
  type CaptiveBackend,
  type CaptiveStatus,
} from "./device-setup.server";

const directory = mkdtempSync(join(tmpdir(), "dither-booth-device-setup-"));
const caPath = join(directory, "rootCA.pem");
writeFileSync(caPath, "-----BEGIN CERTIFICATE-----\nca\n");
writeFileSync(join(directory, "rootCA-key.pem"), "secret");

afterAll(() => {
  rmSync(directory, { force: true, recursive: true });
});

let captiveState: CaptiveStatus["state"] = "pick-network";
const joined: Array<{ ssid: string; password?: string }> = [];
const captive: CaptiveBackend = {
  getStatus: async () => ({ nearby: [], state: captiveState }),
  join: async (input) => {
    joined.push(input);
  },
  runOnBoothWifi: async () => {},
};

const handle = createDeviceSetupFetch({
  adminOrigin: "https://192.168.1.42:3002",
  caPath,
  captive,
  darkroomPath: "/darkroom",
  shutterOrigins: ["https://booth.local:3000", "https://192.168.1.42:3000"],
});
const request = (path: string) =>
  handle(new Request(`http://192.168.1.42:3003${path}`), "192.168.1.20");

const BOOTH_WIFI_CLIENT = "10.42.0.23";

describe("device setup server", () => {
  it("serves the CA's public certificate as an installable profile", async () => {
    const response = await request(DEVICE_SETUP_CA_PATH);

    expect(response.headers.get("content-type")).toBe(
      "application/x-x509-ca-cert",
    );
    expect(await response.text()).toContain("BEGIN CERTIFICATE");
  });

  it("serves the page with the Shutter origins to probe, .local first", async () => {
    const html = await (await request("/")).text();

    expect(html).toContain(
      '["https://booth.local:3000","https://192.168.1.42:3000"]',
    );
    expect(html).toContain(`href="${DEVICE_SETUP_CA_PATH}"`);
  });

  it("sends any other path, the CA key included, back to the page", async () => {
    for (const path of ["/rootCA-key.pem", "/../rootCA-key.pem", "/nope"]) {
      const response = await request(path);

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/");
    }
  });

  describe("captive page on the booth Wi-Fi", () => {
    const appleCheck = (clientIp: string) =>
      handle(
        new Request("http://captive.apple.com/hotspot-detect.html"),
        clientIp,
      );

    it("sends a device's captive check to the Wi-Fi picker while the booth waits for a network", async () => {
      captiveState = "pick-network";
      const response = await appleCheck(BOOTH_WIFI_CLIENT);

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("http://10.42.0.1/wifi");
    });

    it("answers Success when staff run the event on the booth Wi-Fi", async () => {
      captiveState = "booth-wifi-chosen";
      const response = await appleCheck(BOOTH_WIFI_CLIENT);

      expect(await response.text()).toContain("<BODY>Success</BODY>");
      captiveState = "pick-network";
    });

    it("answers each OS the way it expects", async () => {
      captiveState = "booth-wifi-chosen";
      const android = await handle(
        new Request("http://connectivitycheck.gstatic.com/generate_204"),
        BOOTH_WIFI_CLIENT,
      );

      expect(android.status).toBe(204);
      captiveState = "pick-network";
    });

    it("never offers the picker off the booth Wi-Fi", async () => {
      expect((await appleCheck("192.168.1.20")).status).toBe(200);

      const picker = await handle(
        new Request("http://192.168.1.42:3003/wifi"),
        "192.168.1.20",
      );
      expect(picker.status).toBe(302);
      expect(picker.headers.get("location")).toBe("/");
    });

    it("joins only with a JSON request from the booth Wi-Fi", async () => {
      const join = (contentType: string) =>
        handle(
          new Request("http://10.42.0.1/wifi/join", {
            body: JSON.stringify({ password: "venue-pass", ssid: "Venue" }),
            headers: { "content-type": contentType },
            method: "POST",
          }),
          `::ffff:${BOOTH_WIFI_CLIENT}`,
        );

      expect((await join("text/plain")).status).toBe(405);
      expect((await join("application/json")).status).toBe(200);
      expect(joined).toEqual([{ password: "venue-pass", ssid: "Venue" }]);
    });
  });
});
