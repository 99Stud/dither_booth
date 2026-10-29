import { describe, expect, test } from "bun:test";

import { HEALTHY_UPTIME_MS, assessBoothHealth } from "./update.health";
import { planPrune } from "./update.layout";
import { parseSha256Sums } from "./update.release";

const NOW = 1_000_000;
const pm2 = (
  overrides: Record<string, { status: string; pm_uptime?: number }> = {},
) =>
  JSON.stringify(
    ["dither-booth-engine", "dither-booth-admin", "dither-booth-shutter"].map(
      (name) => ({
        name,
        pm2_env: overrides[name] ?? {
          status: "online",
          pm_uptime: NOW - HEALTHY_UPTIME_MS,
        },
      }),
    ),
  );

describe("assessBoothHealth", () => {
  test("is healthy once every process has stayed up and the engine answers", () => {
    expect(
      assessBoothHealth({ pm2: pm2(), engineHealthy: true, now: NOW }),
    ).toEqual({ ok: true });
  });

  test("says which process isn't up, or only just started", () => {
    expect(
      assessBoothHealth({
        pm2: pm2({ "dither-booth-engine": { status: "errored" } }),
        engineHealthy: false,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: "dither-booth-engine is errored" });
    expect(
      assessBoothHealth({
        pm2: pm2({
          "dither-booth-admin": { status: "online", pm_uptime: NOW - 1 },
        }),
        engineHealthy: true,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: "dither-booth-admin only just started" });
  });

  test("isn't healthy without PM2, or with the engine's healthz down", () => {
    expect(
      assessBoothHealth({ pm2: undefined, engineHealthy: true, now: NOW }).ok,
    ).toBe(false);
    expect(
      assessBoothHealth({ pm2: pm2(), engineHealthy: false, now: NOW }).ok,
    ).toBe(false);
  });
});

describe("parseSha256Sums", () => {
  test("reads sha256sum's text and binary lines", () => {
    const hex = "a".repeat(64);
    const sums = parseSha256Sums(
      `${hex}  booth-linux-arm64\n${"b".repeat(64)} *bundle.tar.zst\nnoise\n`,
    );

    expect(sums.get("booth-linux-arm64")).toBe(hex);
    expect(sums.get("bundle.tar.zst")).toBe("b".repeat(64));
    expect(sums.size).toBe(2);
  });
});

describe("planPrune", () => {
  test("keeps the running release and the one before, skips half-unpacked ones", () => {
    expect(
      planPrune(
        ["0.7.0", "legacy-0.6.1", "0.8.0", "0.9.0", "1.0.0.tmp"],
        ["0.9.0", "0.8.0"],
      ),
    ).toEqual(["0.7.0", "legacy-0.6.1"]);
  });
});
