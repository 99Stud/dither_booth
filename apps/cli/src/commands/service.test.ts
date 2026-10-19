import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildPolkitRule } from "./network";
import { buildNetworkDispatcher, buildUnit } from "./service";

describe("ditherbooth.service", () => {
  test("re-issues the certificate before starting, without blocking the start", () => {
    expect(buildUnit("/opt/dither-booth")).toContain(
      "ExecStartPre=-/usr/local/bin/booth cert --if-changed",
    );
  });
});

describe("network dispatcher", () => {
  test("reads the IP the certificate was issued for out of the manifest", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "dither-booth-dispatcher-"));
    const manifest = join(repoRoot, ".local/tls/booth-manifest.json");
    const script = buildNetworkDispatcher(repoRoot);
    const sedLine = script
      .split("\n")
      .find((line) => line.startsWith("recorded="));

    try {
      await Bun.write(
        manifest,
        JSON.stringify({ publicIp: "192.168.1.42", hostnames: [] }, null, 2),
      );
      const scriptPath = join(repoRoot, "read.sh");
      writeFileSync(scriptPath, `${sedLine}\necho "$recorded"\n`);
      const result = Bun.spawnSync(["sh", scriptPath]);

      expect(result.stdout.toString().trim()).toBe("192.168.1.42");
    } finally {
      rmSync(repoRoot, { force: true, recursive: true });
    }
  });
});

describe("network polkit rule", () => {
  test("lets the booth bring its own Wi-Fi up, not only change networks", () => {
    expect(buildPolkitRule()).toContain(
      "org.freedesktop.NetworkManager.wifi.share.protected",
    );
  });
});
