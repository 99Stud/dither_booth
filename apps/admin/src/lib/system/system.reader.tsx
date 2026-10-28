import type {
  SystemSample,
  SystemSource,
  SystemThrottleFlags,
} from "./system.protocol";

import { SYSTEM_DISKS, SYSTEM_THROTTLE_FLAGS } from "./system.constants";
import { KIB, toTenth } from "./system.utils";

/*
 * Reads the Pi: `/proc` and `/sys`, plus `vcgencmd` for the throttle flags
 * the kernel doesn't expose. Every Pi-only reading is optional: off the
 * booth (a laptop in development) it reports unavailable, and the rest,
 * which `node:os` and statfs give anywhere, still works.
 */

export type SystemReaderDeps = {
  /** Reads a whole text file; rejects when it isn't there. */
  readFile: (path: string) => Promise<string>;
  /** Lists a directory's entries; rejects when it isn't there. */
  listDir: (path: string) => Promise<string[]>;
  /** Rejects for a mount that isn't there. */
  statfs: (
    path: string,
  ) => Promise<{ bsize: number; blocks: number; bavail: number }>;
  /** Runs a command (no shell); rejects when the binary is missing. */
  run: (args: string[]) => Promise<{ exitCode: number; stdout: string }>;
  os: {
    cpus: () => unknown[];
    totalmem: () => number;
    loadavg: () => number[];
    uptime: () => number;
  };
  now: () => number;
};

export type SystemReader = {
  sample: () => Promise<SystemSample>;
};

export const THERMAL_ZONE_PATH = "/sys/class/thermal/thermal_zone0/temp";
export const HWMON_DIR = "/sys/class/hwmon";
/** The Pi 5's `FAN` header, as the kernel's pwm-fan driver names it. */
export const FAN_HWMON_NAME = "pwmfan";
export const CPU_FREQUENCY_PATH =
  "/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq";
export const DEVICE_TREE_MODEL_PATH = "/proc/device-tree/model";
export const MEMINFO_PATH = "/proc/meminfo";
export const PROC_STAT_PATH = "/proc/stat";
export const LOADAVG_PATH = "/proc/loadavg";
export const VCGENCMD_THROTTLED_ARGS = ["vcgencmd", "get_throttled"];

const available = (message: string): SystemSource => ({
  state: "available",
  message,
});
const unavailable = (message: string): SystemSource => ({
  state: "unavailable",
  message,
});

/* Parsers: pure, on the file's text. Each returns undefined for bad input. */

/** `/proc/meminfo`: `MemTotal:       4045604 kB` lines. */
export function parseMeminfo(text: string): SystemSample["memory"] | undefined {
  const values = new Map<string, number>();

  for (const line of text.split("\n")) {
    const match = /^(\w+):\s+(\d+)/.exec(line);

    if (match) {
      values.set(match[1]!, Number(match[2]) * KIB);
    }
  }

  const totalBytes = values.get("MemTotal");
  const availableBytes = values.get("MemAvailable");

  if (totalBytes === undefined || availableBytes === undefined) {
    return undefined;
  }

  const swapTotalBytes = values.get("SwapTotal") ?? 0;

  return {
    totalBytes,
    availableBytes,
    cachedBytes: (values.get("Cached") ?? 0) + (values.get("Buffers") ?? 0),
    swapTotalBytes,
    swapUsedBytes: Math.max(0, swapTotalBytes - (values.get("SwapFree") ?? 0)),
  };
}

export type CpuTicks = { idle: number; total: number };

/** The `cpu` line of `/proc/stat`: user nice system idle iowait irq softirq steal. */
export function parseCpuTicks(text: string): CpuTicks | undefined {
  const line = text.split("\n").find((entry) => /^cpu\s/.test(entry));

  if (!line) {
    return undefined;
  }

  const fields = line.trim().split(/\s+/).slice(1, 9).map(Number);

  if (fields.length < 4 || fields.some((field) => Number.isNaN(field))) {
    return undefined;
  }

  const idle = fields[3]! + (fields[4] ?? 0);

  return { idle, total: fields.reduce((sum, field) => sum + field, 0) };
}

/** The busy share between two readings, in percent; null if no time passed. */
export function cpuUsagePercent(
  previous: CpuTicks,
  current: CpuTicks,
): number | null {
  const total = current.total - previous.total;

  if (total <= 0) {
    return null;
  }

  const idle = current.idle - previous.idle;

  return toTenth((1 - idle / total) * 100);
}

/** `/proc/loadavg`: `0.52 0.58 0.59 1/412 12345`. */
export function parseLoadavg(
  text: string,
): [number, number, number] | undefined {
  const [one, five, fifteen] = text.trim().split(/\s+/).map(Number);

  if ([one, five, fifteen].some((n) => n === undefined || Number.isNaN(n))) {
    return undefined;
  }

  return [one!, five!, fifteen!];
}

/** `vcgencmd get_throttled`: `throttled=0x50005`. */
export function parseThrottled(
  text: string,
): { now: SystemThrottleFlags; sinceBoot: SystemThrottleFlags } | undefined {
  const match = /throttled=0x([0-9a-f]+)/i.exec(text);

  if (!match) {
    return undefined;
  }

  const value = Number.parseInt(match[1]!, 16);
  const flags = (offset: number) =>
    Object.fromEntries(
      SYSTEM_THROTTLE_FLAGS.map((flag) => [
        flag.key,
        (value & (1 << (flag.bit + offset))) !== 0,
      ]),
    ) as SystemThrottleFlags;

  return { now: flags(0), sinceBoot: flags(16) };
}

/** A file holding one number; `Number("")` is 0, so digits are required. */
function parseNumber(text: string): number | undefined {
  const trimmed = text.trim();

  return /^-?\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : undefined;
}

/** A thermal zone's `temp`: millidegrees, to a tenth of a degree. */
export function parseMillidegrees(text: string): number | undefined {
  const value = parseNumber(text);

  return value === undefined ? undefined : toTenth(value / 1000);
}

/** `scaling_cur_freq`: kHz, to MHz. */
export function parseKilohertz(text: string): number | undefined {
  const value = parseNumber(text);

  return value === undefined ? undefined : Math.round(value / 1000);
}

/** A sensor's `fan1_input`: RPM. */
export function parseInteger(text: string): number | undefined {
  const value = parseNumber(text);

  return value === undefined ? undefined : Math.round(value);
}

/** `/proc/device-tree/model` is NUL-terminated. */
export function parseDeviceTreeModel(text: string): string | undefined {
  const model = text.split("\u0000")[0]!.trim();

  return model || undefined;
}

export function createSystemReader(deps: SystemReaderDeps): SystemReader {
  let previousTicks: CpuTicks | undefined;

  const read = (path: string) => deps.readFile(path).catch(() => undefined);

  const readThermal = async () => {
    const text = await read(THERMAL_ZONE_PATH);
    const celsius = text === undefined ? undefined : parseMillidegrees(text);

    return {
      celsius: celsius ?? null,
      source:
        celsius === undefined
          ? unavailable("No thermal zone on this machine: read on the booth.")
          : available("From the SoC's thermal zone."),
    };
  };

  const readFan = async () => {
    const entries = await deps.listDir(HWMON_DIR).catch(() => []);

    for (const entry of entries) {
      const name = await read(`${HWMON_DIR}/${entry}/name`);

      if (name?.trim() !== FAN_HWMON_NAME) {
        continue;
      }

      const text = await read(`${HWMON_DIR}/${entry}/fan1_input`);
      const rpm = text === undefined ? undefined : parseInteger(text);

      if (rpm !== undefined) {
        return {
          fanRpm: rpm,
          source: available("From the fan on the Pi's FAN header."),
        };
      }
    }

    return {
      fanRpm: null,
      source: unavailable(
        "No fan sensor: on the booth, the Pi 5 reports the fan on its FAN header.",
      ),
    };
  };

  const readCpuFrequency = async () => {
    const text = await read(CPU_FREQUENCY_PATH);
    const cpuMhz = text === undefined ? undefined : parseKilohertz(text);

    return {
      cpuMhz: cpuMhz ?? null,
      source:
        cpuMhz === undefined
          ? unavailable("No CPU clock reading on this machine.")
          : available("The current CPU clock, from cpufreq."),
    };
  };

  const readThrottle = async () => {
    let result: { exitCode: number; stdout: string };

    try {
      result = await deps.run(VCGENCMD_THROTTLED_ARGS);
    } catch {
      return {
        throttle: null,
        source: unavailable(
          "No vcgencmd on this machine: throttling is read on the booth.",
        ),
      };
    }

    if (result.exitCode !== 0) {
      return {
        throttle: null,
        source: unavailable(
          `vcgencmd failed (exit code ${result.exitCode}). Is pi in the video group?`,
        ),
      };
    }

    const throttle = parseThrottled(result.stdout);

    return throttle
      ? { throttle, source: available("From vcgencmd get_throttled.") }
      : {
          throttle: null,
          source: unavailable("vcgencmd gave an answer the booth can't read."),
        };
  };

  const readMemory = async (): Promise<SystemSample["memory"]> => {
    const text = await read(MEMINFO_PATH);
    const memory = text === undefined ? undefined : parseMeminfo(text);

    // Off Linux there is no "available" figure: macOS counts most memory as
    // used cache, so `os.freemem()` would read as a full machine.
    return (
      memory ?? {
        totalBytes: deps.os.totalmem(),
        availableBytes: null,
        cachedBytes: 0,
        swapTotalBytes: 0,
        swapUsedBytes: 0,
      }
    );
  };

  const readCpu = async (): Promise<SystemSample["cpu"]> => {
    const [loadText, statText] = await Promise.all([
      read(LOADAVG_PATH),
      read(PROC_STAT_PATH),
    ]);
    const load =
      (loadText === undefined ? undefined : parseLoadavg(loadText)) ??
      (deps.os.loadavg().slice(0, 3) as [number, number, number]);
    const ticks = statText === undefined ? undefined : parseCpuTicks(statText);
    const usagePercent =
      ticks && previousTicks ? cpuUsagePercent(previousTicks, ticks) : null;

    previousTicks = ticks ?? previousTicks;

    return { cores: Math.max(1, deps.os.cpus().length), load, usagePercent };
  };

  const readDisks = async (): Promise<SystemSample["disks"]> => {
    const disks = await Promise.all(
      SYSTEM_DISKS.map(async (disk) => {
        const stats = await deps.statfs(disk.mount).catch(() => undefined);

        return stats
          ? {
              ...disk,
              totalBytes: stats.bsize * stats.blocks,
              freeBytes: stats.bsize * stats.bavail,
            }
          : undefined;
      }),
    );

    return disks.filter((disk) => disk !== undefined);
  };

  return {
    async sample() {
      const now = deps.now();
      const [thermal, fan, cpuFrequency, throttle, memory, cpu, disks, model] =
        await Promise.all([
          readThermal(),
          readFan(),
          readCpuFrequency(),
          readThrottle(),
          readMemory(),
          readCpu(),
          readDisks(),
          read(DEVICE_TREE_MODEL_PATH),
        ]);

      return {
        sampledAt: new Date(now).toISOString(),
        hardware: {
          model:
            (model === undefined ? undefined : parseDeviceTreeModel(model)) ??
            null,
          bootedAt: new Date(now - deps.os.uptime() * 1000).toISOString(),
        },
        thermal: {
          celsius: thermal.celsius,
          fanRpm: fan.fanRpm,
          cpuMhz: cpuFrequency.cpuMhz,
          throttle: throttle.throttle,
        },
        memory,
        cpu,
        disks,
        sources: {
          thermal: thermal.source,
          fan: fan.source,
          throttle: throttle.source,
          cpuFrequency: cpuFrequency.source,
        },
      };
    },
  };
}
