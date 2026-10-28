import { describe, expect, it } from "bun:test";

import type { SystemHistory, SystemThrottleFlags } from "./system.protocol";

import {
  formatBytes,
  formatUptime,
  getCpuStatus,
  getFreeStatus,
  getTemperatureStatus,
  getThrottleStatus,
  isSystemStale,
  toPoints,
  worstStatus,
} from "./system.utils";

const clean: SystemThrottleFlags = {
  underVoltage: false,
  frequencyCapped: false,
  throttled: false,
  softTemperatureLimit: false,
};

describe("statuses", () => {
  it("rates temperature against the Pi 5's limits", () => {
    expect(getTemperatureStatus(null)).toBeNull();
    expect(getTemperatureStatus(61.2)).toBe("ok");
    expect(getTemperatureStatus(70)).toBe("warning");
    expect(getTemperatureStatus(80)).toBe("critical");
  });

  it("treats throttling now as critical and since boot as a warning", () => {
    expect(getThrottleStatus(null)).toBeNull();
    expect(getThrottleStatus({ now: clean, sinceBoot: clean })).toBe("ok");
    expect(
      getThrottleStatus({
        now: clean,
        sinceBoot: { ...clean, underVoltage: true },
      }),
    ).toBe("warning");
    expect(
      getThrottleStatus({
        now: { ...clean, throttled: true },
        sinceBoot: { ...clean, throttled: true },
      }),
    ).toBe("critical");
  });

  it("rates free space, load, and takes the worst", () => {
    expect(getFreeStatus(63.4)).toBe("ok");
    expect(getFreeStatus(14.9)).toBe("warning");
    expect(getFreeStatus(4)).toBe("critical");
    expect(
      getCpuStatus({ cores: 4, load: [3.9, 1, 1], usagePercent: null }),
    ).toBe("ok");
    expect(
      getCpuStatus({ cores: 4, load: [4.1, 1, 1], usagePercent: null }),
    ).toBe("warning");
    expect(
      getCpuStatus({ cores: 4, load: [9, 1, 1], usagePercent: null }),
    ).toBe("critical");
    expect(worstStatus()).toBeNull();
    expect(worstStatus(null, "ok", "warning", null)).toBe("warning");
    expect(worstStatus("critical", "ok")).toBe("critical");
  });

  it("is stale past three sampling intervals", () => {
    expect(isSystemStale({ ageMs: 14_999 })).toBe(false);
    expect(isSystemStale({ ageMs: 15_001 })).toBe(true);
  });
});

describe("formatting", () => {
  it("writes bytes the way free and df do", () => {
    expect(formatBytes(4045604 * 1024)).toBe("3.9 GB");
    expect(formatBytes(512 * 1024 ** 2)).toBe("512 MB");
    expect(formatBytes(2048)).toBe("2 kB");
  });

  it("writes uptime in the two largest units", () => {
    const now = Date.UTC(2026, 9, 28, 14, 0, 0);

    expect(formatUptime(new Date(now - 12 * 60_000).toISOString(), now)).toBe(
      "12 min",
    );
    expect(formatUptime(new Date(now - 252 * 60_000).toISOString(), now)).toBe(
      "4 h 12 min",
    );
    expect(
      formatUptime(
        new Date(now - (3 * 1440 + 240) * 60_000).toISOString(),
        now,
      ),
    ).toBe("3 d 4 h");
  });

  it("turns the last samples of a series into points", () => {
    const history: SystemHistory = {
      t: [1, 2, 3],
      celsius: [50, null, 52],
      availablePercent: [60, 61, 62],
      cpuPercent: [null, 10, 20],
    };

    expect(toPoints(history, "celsius", 2)).toEqual([
      { t: 2, value: null },
      { t: 3, value: 52 },
    ]);
    expect(toPoints(history, "availablePercent", 10)).toHaveLength(3);
  });
});
