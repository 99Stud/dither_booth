import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildPolkitRule } from "./network";
import {
  buildLogrotateRule,
  buildNetworkDispatcher,
  buildUnit,
} from "./service";

describe("PM2 log rotation", () => {
  const rule = buildLogrotateRule("/mnt/ssd/dither-booth");
  const directives = rule
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  test("rotates the combined PM2 file of each process in the configured repo", () => {
    expect(directives.slice(0, 4)).toEqual([
      "/mnt/ssd/dither-booth/logs/pm2/dither-booth-engine.log",
      "/mnt/ssd/dither-booth/logs/pm2/dither-booth-admin.log",
      "/mnt/ssd/dither-booth/logs/pm2/dither-booth-shutter.log",
      "{",
    ]);
    expect(directives.at(-1)).toBe("}");
  });

  test("leaves the old -out.log and -err.log files alone", () => {
    expect(rule).not.toContain("*");
  });

  test("rotates daily or at 20 MB, keeps 7 compressed files, never closes PM2's handle", () => {
    expect(directives).toEqual(
      expect.arrayContaining([
        "daily",
        "maxsize 20M",
        "rotate 7",
        "compress",
        "copytruncate",
      ]),
    );
  });

  test("rotates as the service user, who owns the log folder", () => {
    expect(directives).toContain("su pi pi");
  });
});

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

describe("network dispatcher on the booth Wi-Fi", () => {
  test("restarts nothing: every certificate covers its address", () => {
    expect(buildNetworkDispatcher("/opt/dither-booth")).toContain(
      '[ "$current" = "10.42.0.1" ] && exit 0',
    );
  });
});
