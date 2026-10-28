import { describe, expect, it } from "bun:test";

import {
  cpuUsagePercent,
  createSystemReader,
  parseCpuTicks,
  parseDeviceTreeModel,
  parseLoadavg,
  parseMeminfo,
  parseMillidegrees,
  parseThrottled,
} from "./system.reader";
import {
  PI_FILES,
  PI_MEMINFO,
  PI_STAT_FIRST,
  PI_STAT_SECOND,
  createLaptopDeps,
  createPiDeps,
} from "./system.testing";

describe("parsers", () => {
  it("reads /proc/meminfo in bytes, cache and buffers together", () => {
    expect(parseMeminfo(PI_MEMINFO)).toEqual({
      totalBytes: 4045604 * 1024,
      availableBytes: 2563212 * 1024,
      cachedBytes: (2192516 + 90120) * 1024,
      swapTotalBytes: 524284 * 1024,
      swapUsedBytes: (524284 - 401404) * 1024,
    });
    expect(parseMeminfo("MemFree: 12 kB\n")).toBeUndefined();
  });

  it("measures CPU use between two /proc/stat readings", () => {
    const first = parseCpuTicks(PI_STAT_FIRST)!;
    const second = parseCpuTicks(PI_STAT_SECOND)!;

    expect(first).toEqual({ idle: 8100, total: 9650 });
    expect(cpuUsagePercent(first, second)).toBe(75);
    expect(cpuUsagePercent(first, first)).toBeNull();
    expect(parseCpuTicks("intr 1 2 3\n")).toBeUndefined();
  });

  it("reads the load averages", () => {
    expect(parseLoadavg("0.52 0.58 0.59 1/412 12345\n")).toEqual([
      0.52, 0.58, 0.59,
    ]);
    expect(parseLoadavg("")).toBeUndefined();
  });

  it("splits vcgencmd's bitmask into now and since boot", () => {
    const clean = {
      underVoltage: false,
      frequencyCapped: false,
      throttled: false,
      softTemperatureLimit: false,
    };

    expect(parseThrottled("throttled=0x0\n")).toEqual({
      now: clean,
      sinceBoot: clean,
    });
    expect(parseThrottled("throttled=0x50000\n")).toEqual({
      now: clean,
      sinceBoot: { ...clean, underVoltage: true, throttled: true },
    });
    expect(parseThrottled("throttled=0x50005\n")).toEqual({
      now: { ...clean, underVoltage: true, throttled: true },
      sinceBoot: { ...clean, underVoltage: true, throttled: true },
    });
    expect(parseThrottled("VCHI initialization failed\n")).toBeUndefined();
  });

  it("reads millidegrees to a tenth, and the NUL-terminated model", () => {
    expect(parseMillidegrees("61234\n")).toBe(61.2);
    expect(parseMillidegrees("")).toBeUndefined();
    expect(parseDeviceTreeModel("Raspberry Pi 5 Model B Rev 1.0\0")).toBe(
      "Raspberry Pi 5 Model B Rev 1.0",
    );
  });
});

describe("createSystemReader", () => {
  it("reads everything on a Pi, with CPU use from the second sample on", async () => {
    const files = { ...PI_FILES };
    const deps = createPiDeps({ files, throttled: "throttled=0x50000\n" });
    const reader = createSystemReader(deps);

    const first = await reader.sample();

    expect(first.sampledAt).toBe("2026-10-28T14:00:00.000Z");
    expect(first.hardware).toEqual({
      model: "Raspberry Pi 5 Model B Rev 1.0",
      bootedAt: "2026-10-28T13:00:00.000Z",
    });
    expect(first.thermal.celsius).toBe(61.2);
    expect(first.thermal.fanRpm).toBe(2954);
    expect(first.thermal.cpuMhz).toBe(2400);
    expect(first.thermal.throttle?.sinceBoot.underVoltage).toBe(true);
    expect(first.thermal.throttle?.now.underVoltage).toBe(false);
    expect(first.memory.totalBytes).toBe(4045604 * 1024);
    expect(first.cpu).toEqual({
      cores: 4,
      load: [0.52, 0.58, 0.59],
      usagePercent: null,
    });
    expect(first.disks.map((disk) => disk.label)).toEqual(["microSD", "SSD"]);
    expect(first.disks[1]).toEqual({
      mount: "/mnt/ssd",
      label: "SSD",
      totalBytes: 4096 * 120_000_000,
      freeBytes: 4096 * 100_000_000,
    });
    expect(
      Object.values(first.sources).every((s) => s.state === "available"),
    ).toBe(true);
    expect(deps.calls).toEqual([["vcgencmd", "get_throttled"]]);

    files["/proc/stat"] = PI_STAT_SECOND;

    const second = await reader.sample();

    expect(second.cpu.usagePercent).toBe(75);
  });

  it("falls back to node:os on a laptop and says what it can't read", async () => {
    const sample = await createSystemReader(createLaptopDeps()).sample();

    expect(sample.thermal).toEqual({
      celsius: null,
      fanRpm: null,
      cpuMhz: null,
      throttle: null,
    });
    expect(sample.memory).toEqual({
      totalBytes: 8 * 1024 ** 3,
      availableBytes: null,
      cachedBytes: 0,
      swapTotalBytes: 0,
      swapUsedBytes: 0,
    });
    expect(sample.cpu.load).toEqual([1.5, 1.2, 1]);
    expect(sample.disks.map((disk) => disk.mount)).toEqual(["/"]);
    expect(sample.hardware.model).toBeNull();
    expect(sample.sources.throttle).toEqual({
      state: "unavailable",
      message: "No vcgencmd on this machine: throttling is read on the booth.",
    });
    expect(sample.sources.thermal.state).toBe("unavailable");
    expect(sample.sources.fan.state).toBe("unavailable");
  });

  it("reports a failing vcgencmd without losing the rest", async () => {
    const deps = createPiDeps();

    deps.run = async () => ({ exitCode: 255, stdout: "" });

    const sample = await createSystemReader(deps).sample();

    expect(sample.thermal.throttle).toBeNull();
    expect(sample.sources.throttle.message).toContain("exit code 255");
    expect(sample.thermal.celsius).toBe(61.2);
  });
});
