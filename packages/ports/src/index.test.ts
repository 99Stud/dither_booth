import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  getApiInternalOrigin,
  getPort,
  getWebOrigin,
  getWebPublicIp,
  getWebTlsManifestPath,
} from "./index";

const ENV_NAMES = [
  "API_BIND_HOST",
  "API_PORT",
  "WEB_PORT",
  "WEB_PUBLIC_IP",
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

function writeManifest(manifestPath: string, publicIp: string) {
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(
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

  it("reads web public IP from TLS manifest", () => {
    const { manifestPath, repoPathOptions } = createTempTlsPaths();

    process.env.WEB_PORT = "3443";
    writeManifest(manifestPath, "192.168.1.42");

    expect(getWebPublicIp(repoPathOptions)).toBe("192.168.1.42");
    expect(getWebOrigin(repoPathOptions)).toBe("https://192.168.1.42:3443");
  });

  it("prefers WEB_PUBLIC_IP over manifest value", () => {
    const { manifestPath, repoPathOptions } = createTempTlsPaths();

    writeManifest(manifestPath, "192.168.1.42");
    process.env.WEB_PUBLIC_IP = "10.0.0.7";

    expect(getWebPublicIp(repoPathOptions)).toBe("10.0.0.7");
  });

  it("formats IPv6 web origins with brackets", () => {
    const { repoPathOptions } = createTempTlsPaths();
    process.env.WEB_PORT = "3443";
    process.env.WEB_PUBLIC_IP = "fe80::1";

    expect(getWebOrigin(repoPathOptions)).toBe("https://[fe80::1]:3443");
  });

  it("throws clear error when public IP is missing", () => {
    const { repoPathOptions } = createTempTlsPaths();

    expect(() => getWebPublicIp(repoPathOptions)).toThrow(
      /Missing public web IP/,
    );
  });

  it("rejects port values with junk suffixes", () => {
    process.env.WEB_PORT = "3000foo";

    expect(() => getPort("WEB_PORT")).toThrow(
      /Invalid port in environment variable WEB_PORT: 3000foo\. must be a whole number/,
    );
  });

  it("rejects port values above 65535", () => {
    process.env.API_PORT = "70000";

    expect(() => getPort("API_PORT")).toThrow(
      /Invalid port in environment variable API_PORT: 70000\. must be between 1 and 65535/,
    );
  });
});
