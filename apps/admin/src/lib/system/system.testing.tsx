import type { SystemSnapshot } from "./system.protocol";
import type { SystemReaderDeps } from "./system.reader";

/*
 * Fakes for the reader: a Pi 5 as the booth's kernel reports it, and a
 * laptop with none of the Pi's files.
 */

export const PI_MEMINFO = `MemTotal:        4045604 kB
MemFree:          219836 kB
MemAvailable:    2563212 kB
Buffers:           90120 kB
Cached:          2192516 kB
SwapCached:            0 kB
SwapTotal:        524284 kB
SwapFree:         401404 kB
`;

export const PI_STAT_FIRST = `cpu  1000 0 500 8000 100 0 50 0 0 0
cpu0 250 0 125 2000 25 0 12 0 0 0
`;

/** 400 ticks later: 300 busy, 100 idle. */
export const PI_STAT_SECOND = `cpu  1200 0 600 8080 120 0 50 0 0 0
cpu0 300 0 150 2020 30 0 12 0 0 0
`;

export const PI_LOADAVG = "0.52 0.58 0.59 1/412 12345\n";
export const PI_TEMP = "61234\n";
export const PI_FREQ = "2400000\n";
export const PI_FAN_RPM = "2954\n";
export const PI_MODEL = "Raspberry Pi 5 Model B Rev 1.0\0";

export const PI_FILES: Record<string, string> = {
  "/proc/meminfo": PI_MEMINFO,
  "/proc/stat": PI_STAT_FIRST,
  "/proc/loadavg": PI_LOADAVG,
  "/proc/device-tree/model": PI_MODEL,
  "/sys/class/thermal/thermal_zone0/temp": PI_TEMP,
  "/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq": PI_FREQ,
  "/sys/class/hwmon/hwmon0/name": "rp1_adc\n",
  "/sys/class/hwmon/hwmon1/name": "pwmfan\n",
  "/sys/class/hwmon/hwmon1/fan1_input": PI_FAN_RPM,
};

export const PI_DISKS: Record<
  string,
  { bsize: number; blocks: number; bavail: number }
> = {
  "/": { bsize: 4096, blocks: 30_000_000, bavail: 20_000_000 },
  "/mnt/ssd": { bsize: 4096, blocks: 120_000_000, bavail: 100_000_000 },
};

export const FAKE_OS: SystemReaderDeps["os"] = {
  cpus: () => [1, 2, 3, 4],
  totalmem: () => 8 * 1024 ** 3,
  loadavg: () => [1.5, 1.2, 1],
  uptime: () => 3600,
};

export const FAKE_NOW = Date.UTC(2026, 9, 28, 14, 0, 0);

/** A Pi 5: every file there, `vcgencmd` answering `throttled`. */
export function createPiDeps({
  files = PI_FILES,
  throttled = "throttled=0x0\n",
  now = () => FAKE_NOW,
}: {
  files?: Record<string, string>;
  throttled?: string;
  now?: () => number;
} = {}): SystemReaderDeps & { calls: string[][] } {
  const calls: string[][] = [];

  return {
    calls,
    readFile: async (path) => {
      const text = files[path];

      if (text === undefined) {
        throw new Error(`ENOENT: ${path}`);
      }

      return text;
    },
    listDir: async (path) => {
      const prefix = `${path}/`;
      const names = new Set(
        Object.keys(files)
          .filter((file) => file.startsWith(prefix))
          .map((file) => file.slice(prefix.length).split("/")[0]!),
      );

      if (names.size === 0) {
        throw new Error(`ENOENT: ${path}`);
      }

      return [...names];
    },
    statfs: async (path) => {
      const stats = PI_DISKS[path];

      if (!stats) {
        throw new Error(`ENOENT: ${path}`);
      }

      return stats;
    },
    run: async (args) => {
      calls.push(args);

      return { exitCode: 0, stdout: throttled };
    },
    os: FAKE_OS,
    now,
  };
}

/** A laptop: no `/proc`, no `/sys`, no `vcgencmd`, only the root disk. */
export function createLaptopDeps(): SystemReaderDeps {
  const missing = async (what: string | string[]): Promise<never> => {
    throw new Error(`ENOENT: ${[what].flat().join(" ")}`);
  };

  return {
    readFile: missing,
    listDir: missing,
    statfs: async (path) => {
      if (path !== "/") {
        throw new Error(`ENOENT: ${path}`);
      }

      return PI_DISKS["/"]!;
    },
    run: missing,
    os: FAKE_OS,
    now: () => FAKE_NOW,
  };
}

/** What the page gets from a healthy Pi, with a flag since boot. */
export function createSnapshotFixture(
  overrides: Partial<SystemSnapshot> = {},
): SystemSnapshot {
  const clean = {
    underVoltage: false,
    frequencyCapped: false,
    throttled: false,
    softTemperatureLimit: false,
  };
  const t = [FAKE_NOW - 10_000, FAKE_NOW - 5_000, FAKE_NOW];

  return {
    sampledAt: new Date(FAKE_NOW).toISOString(),
    ageMs: 1_000,
    hardware: {
      model: "Raspberry Pi 5 Model B Rev 1.0",
      bootedAt: new Date(FAKE_NOW - 3_600_000).toISOString(),
    },
    thermal: {
      celsius: 61.2,
      fanRpm: 2954,
      cpuMhz: 2400,
      throttle: {
        now: clean,
        sinceBoot: { ...clean, underVoltage: true },
      },
    },
    memory: {
      totalBytes: 4045604 * 1024,
      availableBytes: 2563212 * 1024,
      cachedBytes: 2282636 * 1024,
      swapTotalBytes: 524284 * 1024,
      swapUsedBytes: 122880 * 1024,
    },
    cpu: { cores: 4, load: [0.52, 0.58, 0.59], usagePercent: 23 },
    disks: [
      {
        mount: "/",
        label: "microSD",
        totalBytes: 4096 * 30_000_000,
        freeBytes: 4096 * 20_000_000,
      },
      {
        mount: "/mnt/ssd",
        label: "SSD",
        totalBytes: 4096 * 120_000_000,
        freeBytes: 4096 * 100_000_000,
      },
    ],
    sources: {
      thermal: { state: "available", message: "From the SoC's thermal zone." },
      fan: {
        state: "available",
        message: "From the fan on the Pi's FAN header.",
      },
      throttle: { state: "available", message: "From vcgencmd get_throttled." },
      cpuFrequency: {
        state: "available",
        message: "The current CPU clock, from cpufreq.",
      },
    },
    history: {
      t,
      celsius: [59.8, 60.5, 61.2],
      availablePercent: [63.1, 63.3, 63.4],
      cpuPercent: [null, 20, 23],
    },
    ...overrides,
  };
}
