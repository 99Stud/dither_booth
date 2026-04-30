import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  getAdminOrigin,
  getApiInternalOrigin,
  getPort,
  getWebOrigin,
  getWebPublicIp,
  getWebTlsCertPath,
  getWebTlsKeyPath,
  getWebTlsManifestPath,
} from "../index";

const ENV_NAMES = ["ADMIN_PORT", "API_PORT", "WEB_PORT"] as const;

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
  const certPath = getWebTlsCertPath(repoPathOptions);
  const keyPath = getWebTlsKeyPath(repoPathOptions);

  tempDirectories.push(directory);

  return {
    certPath,
    directory,
    keyPath,
    repoPathOptions,
    manifestPath: getWebTlsManifestPath(repoPathOptions),
  };
}

async function writeRawManifest(manifestPath: string, manifest: string) {
  mkdirSync(path.dirname(manifestPath), { recursive: true });

  await Bun.write(manifestPath, manifest);
}

async function writeManifest(
  manifestPath: string,
  publicIp: string,
  tlsPaths: { certPath: string; keyPath: string },
) {
  await writeRawManifest(
    manifestPath,
    `${JSON.stringify(
      {
        certPath: tlsPaths.certPath,
        generatedAt: "2026-04-13T00:00:00.000Z",
        keyPath: tlsPaths.keyPath,
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
  it("uses fixed loopback host for API internal origin", () => {
    process.env.API_PORT = "4010";

    expect(getApiInternalOrigin()).toBe("http://127.0.0.1:4010");
  });

  it("uses fixed repo-local TLS paths", () => {
    const { directory, repoPathOptions } = createTempTlsPaths();

    expect(getWebTlsCertPath(repoPathOptions)).toBe(
      path.join(directory, ".local/tls/booth-cert.pem"),
    );
    expect(getWebTlsKeyPath(repoPathOptions)).toBe(
      path.join(directory, ".local/tls/booth-key.pem"),
    );
    expect(getWebTlsManifestPath(repoPathOptions)).toBe(
      path.join(directory, ".local/tls/booth-manifest.json"),
    );
  });

  it("reads web public IP from TLS manifest", async () => {
    const { certPath, keyPath, manifestPath, repoPathOptions } =
      createTempTlsPaths();

    process.env.WEB_PORT = "3443";
    await writeManifest(manifestPath, "192.168.1.42", { certPath, keyPath });

    expect(await getWebPublicIp(repoPathOptions)).toBe("192.168.1.42");
    expect(await getWebOrigin(repoPathOptions)).toBe(
      "https://192.168.1.42:3443",
    );
  });

  it("reads admin origin from the shared TLS manifest", async () => {
    const { certPath, keyPath, manifestPath, repoPathOptions } =
      createTempTlsPaths();

    process.env.ADMIN_PORT = "3444";
    await writeManifest(manifestPath, "192.168.1.43", { certPath, keyPath });

    expect(await getAdminOrigin(repoPathOptions)).toBe(
      "https://192.168.1.43:3444",
    );
  });

  it("formats IPv6 web origins with brackets", async () => {
    const { certPath, keyPath, manifestPath, repoPathOptions } =
      createTempTlsPaths();

    process.env.WEB_PORT = "3443";
    await writeManifest(manifestPath, "fe80::1", { certPath, keyPath });

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
    const { certPath, keyPath, manifestPath, repoPathOptions } =
      createTempTlsPaths();

    await writeRawManifest(
      manifestPath,
      `${JSON.stringify({
        certPath,
        generatedAt: "2026-04-13T00:00:00.000Z",
        keyPath,
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
