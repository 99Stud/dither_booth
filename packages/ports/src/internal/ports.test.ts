import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  getAdminBindHost,
  getAdminOrigin,
  getApiInternalOrigin,
  getPort,
  getWebBindHost,
  getWebOrigin,
  getWebPublicIp,
  getWebTlsManifestPath,
} from "../index";

const ENV_NAMES = [
  "ADMIN_BIND_HOST",
  "ADMIN_PORT",
  "API_BIND_HOST",
  "API_PORT",
  "WEB_BIND_HOST",
  "WEB_PORT",
  "WEB_TLS_CERT_PATH",
  "WEB_TLS_KEY_PATH",
] as const;

const originalEnv = Object.fromEntries(
  ENV_NAMES.map((name) => [name, process.env[name]]),
) as Record<(typeof ENV_NAMES)[number], string | undefined>;

const tempDirectories: string[] = [];

function restoreEnvironment() {
  for (const name of ENV_NAMES) {
    const value = originalEnv[name];

    if (value === undefined) {
      delete process.env[name];
      continue;
    }

    process.env[name] = value;
  }
}

function createTempTlsPaths() {
  const directory = mkdtempSync(path.join(tmpdir(), "dither-booth-ports-"));
  const repoPathOptions = { repoRoot: directory };

  tempDirectories.push(directory);
  process.env.WEB_TLS_CERT_PATH = path.join(directory, "booth-cert.pem");
  process.env.WEB_TLS_KEY_PATH = path.join(directory, "booth-key.pem");

  return {
    directory,
    repoPathOptions,
    manifestPath: getWebTlsManifestPath(repoPathOptions),
  };
}

async function writeRawManifest(manifestPath: string, manifest: string) {
  mkdirSync(path.dirname(manifestPath), { recursive: true });

  await Bun.write(manifestPath, manifest);
}

async function writeManifest(manifestPath: string, publicIp: string) {
  await writeRawManifest(
    manifestPath,
    `${JSON.stringify(
      {
        certPath: process.env.WEB_TLS_CERT_PATH,
        generatedAt: "2026-04-13T00:00:00.000Z",
        keyPath: process.env.WEB_TLS_KEY_PATH,
        publicIp,
      },
      null,
      2,
    )}\n`,
  );
}

afterEach(() => {
  restoreEnvironment();

  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("@dither-booth/ports", () => {
  it("uses loopback for API internal origin when bind host is wildcard", () => {
    process.env.API_BIND_HOST = "0.0.0.0";
    process.env.API_PORT = "4010";

    expect(getApiInternalOrigin()).toBe("http://127.0.0.1:4010");
  });

  it("uses fallback for blank web bind host values", () => {
    process.env.WEB_BIND_HOST = "";
    expect(getWebBindHost()).toBe("0.0.0.0");

    process.env.WEB_BIND_HOST = "   ";
    expect(getWebBindHost()).toBe("0.0.0.0");
  });

  it("uses fallback for blank admin bind host values", () => {
    process.env.ADMIN_BIND_HOST = "";
    expect(getAdminBindHost()).toBe("0.0.0.0");

    process.env.ADMIN_BIND_HOST = "   ";
    expect(getAdminBindHost()).toBe("0.0.0.0");
  });

  it("reads web public IP from TLS manifest", async () => {
    const { manifestPath, repoPathOptions } = createTempTlsPaths();

    process.env.WEB_PORT = "3443";
    await writeManifest(manifestPath, "192.168.1.42");

    expect(await getWebPublicIp(repoPathOptions)).toBe("192.168.1.42");
    expect(await getWebOrigin(repoPathOptions)).toBe(
      "https://192.168.1.42:3443",
    );
  });

  it("reads admin origin from the shared TLS manifest", async () => {
    const { manifestPath, repoPathOptions } = createTempTlsPaths();

    process.env.ADMIN_PORT = "3444";
    await writeManifest(manifestPath, "192.168.1.43");

    expect(await getAdminOrigin(repoPathOptions)).toBe(
      "https://192.168.1.43:3444",
    );
  });

  it("formats IPv6 web origins with brackets", async () => {
    const { manifestPath, repoPathOptions } = createTempTlsPaths();

    process.env.WEB_PORT = "3443";
    await writeManifest(manifestPath, "fe80::1");

    expect(await getWebOrigin(repoPathOptions)).toBe("https://[fe80::1]:3443");
  });

  it("throws clear error when public IP is missing", async () => {
    const { repoPathOptions } = createTempTlsPaths();

    await expect(getWebPublicIp(repoPathOptions)).rejects.toThrow(
      /Missing public web IP/,
    );
  });

  it("throws clear error when TLS manifest is malformed JSON", async () => {
    const { manifestPath, repoPathOptions } = createTempTlsPaths();

    await writeRawManifest(manifestPath, "{");

    await expect(getWebPublicIp(repoPathOptions)).rejects.toThrow(
      /Failed to parse TLS manifest/,
    );
  });

  it("throws clear error when TLS manifest schema is invalid", async () => {
    const { manifestPath, repoPathOptions } = createTempTlsPaths();

    await writeRawManifest(
      manifestPath,
      `${JSON.stringify({
        certPath: process.env.WEB_TLS_CERT_PATH,
        generatedAt: "2026-04-13T00:00:00.000Z",
        keyPath: process.env.WEB_TLS_KEY_PATH,
        publicIp: "localhost",
      })}\n`,
    );

    await expect(getWebPublicIp(repoPathOptions)).rejects.toThrow(
      /Failed to parse TLS manifest/,
    );
  });

  it("rejects non-decimal port values", () => {
    for (const port of ["3000foo", "1e3", "0x10"]) {
      process.env.WEB_PORT = port;

      expect(() => getPort("WEB_PORT")).toThrow(
        new RegExp(
          `Invalid port in environment variable WEB_PORT: ${port}\\. must be a whole number`,
        ),
      );
    }
  });

  it("rejects port values above 65535", () => {
    process.env.API_PORT = "70000";

    expect(() => getPort("API_PORT")).toThrow(
      /Invalid port in environment variable API_PORT: 70000\. must be between 1 and 65535/,
    );
  });
});
