import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DEVICE_SETUP_CA_PATH,
  createDeviceSetupFetch,
} from "./device-setup.server";

const directory = mkdtempSync(join(tmpdir(), "dither-booth-device-setup-"));
const caPath = join(directory, "rootCA.pem");
writeFileSync(caPath, "-----BEGIN CERTIFICATE-----\nca\n");
writeFileSync(join(directory, "rootCA-key.pem"), "secret");

afterAll(() => {
  rmSync(directory, { force: true, recursive: true });
});

const handle = createDeviceSetupFetch({
  adminOrigin: "https://192.168.1.42:3002",
  caPath,
  darkroomPath: "/darkroom",
  shutterOrigins: ["https://booth.local:3000", "https://192.168.1.42:3000"],
});
const request = (path: string) =>
  handle(new Request(`http://192.168.1.42:3003${path}`));

describe("device setup server", () => {
  it("serves the CA's public certificate as an installable profile", async () => {
    const response = request(DEVICE_SETUP_CA_PATH);

    expect(response.headers.get("content-type")).toBe(
      "application/x-x509-ca-cert",
    );
    expect(await response.text()).toContain("BEGIN CERTIFICATE");
  });

  it("serves the page with the Shutter origins to probe, .local first", async () => {
    const html = await request("/").text();

    expect(html).toContain(
      '["https://booth.local:3000","https://192.168.1.42:3000"]',
    );
    expect(html).toContain(`href="${DEVICE_SETUP_CA_PATH}"`);
  });

  it("sends any other path, the CA key included, back to the page", () => {
    for (const path of ["/rootCA-key.pem", "/../rootCA-key.pem", "/nope"]) {
      const response = request(path);

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/");
    }
  });
});
