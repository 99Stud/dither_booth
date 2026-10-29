import type { StatusDotVariant } from "#components/Misc/StatusDot/internal/StatusDot.types";

import type { SystemThrottleFlagKey } from "./system.constants";
import type {
  SystemHistory,
  SystemSample,
  SystemSnapshot,
  SystemThrottleFlags,
} from "./system.protocol";

import {
  SYSTEM_FREE_CRITICAL_PERCENT,
  SYSTEM_FREE_WARNING_PERCENT,
  SYSTEM_STALE_AFTER_MS,
  SYSTEM_TEMPERATURE_CRITICAL_C,
  SYSTEM_TEMPERATURE_WARNING_C,
  SYSTEM_THROTTLE_FLAGS,
} from "./system.constants";

/*
 * What a reading means, in one of three words, and how it is written.
 * Browser-safe: the page, the Health card and their tests share it.
 */

export type SystemStatus = "ok" | "warning" | "critical";

/** The header word for a reading only the Pi has. */
export const NOT_ON_A_PI_LABEL = "Not on a Pi";
/** The row text for a reading only the Pi has. */
export const READ_ON_THE_BOOTH_TEXT = "Read on the booth";
/** What a chart says while there aren't two readings to draw. */
export const CHART_WAITING_TEXT = "The chart fills in from the second reading.";

/** Temperature in a word; the Health card lowercases it mid-sentence. */
export const TEMPERATURE_LABELS: Record<SystemStatus, string> = {
  ok: "Cool",
  warning: "Warm",
  critical: "Hot",
};

/** A panel's header word: its own words, or the one for a reading only the Pi has. */
export const getStatusLabel = (
  status: SystemStatus | null,
  labels: Record<SystemStatus, string>,
) => (status === null ? NOT_ON_A_PI_LABEL : labels[status]);

/** To a tenth: every share and degree the page shows. */
export const toTenth = (value: number) => Math.round(value * 10) / 10;

const STATUS_RANK: Record<SystemStatus, number> = {
  ok: 0,
  warning: 1,
  critical: 2,
};

/** The worst of several readings; null when none has one. */
export function worstStatus(
  ...statuses: Array<SystemStatus | null>
): SystemStatus | null {
  return statuses.reduce<SystemStatus | null>(
    (worst, status) =>
      status === null
        ? worst
        : worst === null || STATUS_RANK[status] > STATUS_RANK[worst]
          ? status
          : worst,
    null,
  );
}

/** Free share of a total, to a tenth of a percent. */
export const freePercent = (free: number, total: number) =>
  total > 0 ? toTenth((free / total) * 100) : 0;

export function getFreeStatus(percent: number): SystemStatus {
  return percent < SYSTEM_FREE_CRITICAL_PERCENT
    ? "critical"
    : percent < SYSTEM_FREE_WARNING_PERCENT
      ? "warning"
      : "ok";
}

export function getTemperatureStatus(
  celsius: number | null,
): SystemStatus | null {
  if (celsius === null) {
    return null;
  }

  return celsius >= SYSTEM_TEMPERATURE_CRITICAL_C
    ? "critical"
    : celsius >= SYSTEM_TEMPERATURE_WARNING_C
      ? "warning"
      : "ok";
}

export const activeThrottleFlags = (flags: SystemThrottleFlags) =>
  SYSTEM_THROTTLE_FLAGS.filter((flag) => flags[flag.key]);

type SystemThrottle = NonNullable<SystemSample["thermal"]["throttle"]>;

/** One flag: set now is critical, set at some point since boot a warning. */
export const getThrottleFlagStatus = (
  throttle: SystemThrottle,
  key: SystemThrottleFlagKey,
): SystemStatus =>
  throttle.now[key] ? "critical" : throttle.sinceBoot[key] ? "warning" : "ok";

/** The worst flag: throttling now is critical, a flag since boot a warning. */
export function getThrottleStatus(
  throttle: SystemSample["thermal"]["throttle"],
): SystemStatus | null {
  if (!throttle) {
    return null;
  }

  return worstStatus(
    ...SYSTEM_THROTTLE_FLAGS.map((flag) =>
      getThrottleFlagStatus(throttle, flag.key),
    ),
  );
}

export const getThermalStatus = (thermal: SystemSample["thermal"]) =>
  worstStatus(
    getTemperatureStatus(thermal.celsius),
    getThrottleStatus(thermal.throttle),
  );

export const getMemoryStatus = (memory: SystemSample["memory"]) =>
  memory.availableBytes === null
    ? null
    : getFreeStatus(freePercent(memory.availableBytes, memory.totalBytes));

export const getDiskStatus = (disk: SystemSample["disks"][number]) =>
  getFreeStatus(freePercent(disk.freeBytes, disk.totalBytes));

export const getStorageStatus = (disks: SystemSample["disks"]) =>
  worstStatus(...disks.map(getDiskStatus));

/** Load against the cores: past them work queues, past twice the booth lags. */
export function getCpuStatus(cpu: SystemSample["cpu"]): SystemStatus {
  const ratio = cpu.load[0] / cpu.cores;

  return ratio > 2 ? "critical" : ratio > 1 ? "warning" : "ok";
}

export const getOverallSystemStatus = (sample: SystemSample) =>
  worstStatus(
    getThermalStatus(sample.thermal),
    getMemoryStatus(sample.memory),
    getCpuStatus(sample.cpu),
    getStorageStatus(sample.disks),
  );

export const getStatusDotVariant = (
  status: SystemStatus | null,
): StatusDotVariant =>
  status === null
    ? "neutral"
    : status === "ok"
      ? "success"
      : status === "warning"
        ? "warning"
        : "error";

export const isSystemStale = (snapshot: Pick<SystemSnapshot, "ageMs">) =>
  snapshot.ageMs > SYSTEM_STALE_AFTER_MS;

export const KIB = 1024;
const MIB = KIB ** 2;
export const GIB = KIB ** 3;

/** Binary units, labelled the way `free -h` and `df -h` show them. */
export function formatBytes(bytes: number): string {
  if (bytes >= GIB) {
    return `${(bytes / GIB).toFixed(1)} GB`;
  }

  if (bytes >= MIB) {
    return `${Math.round(bytes / MIB)} MB`;
  }

  return `${Math.round(bytes / KIB)} kB`;
}

export const formatPercent = (percent: number) => `${Math.round(percent)}%`;

/** "3 d 4 h", "4 h 12 min" or "12 min". */
export function formatUptime(bootedAt: string, now: number): string {
  const minutes = Math.max(
    0,
    Math.floor((now - Date.parse(bootedAt)) / 60_000),
  );
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;

  if (days > 0) {
    return `${days} d ${hours} h`;
  }

  if (hours > 0) {
    return `${hours} h ${rest} min`;
  }

  return `${rest} min`;
}

export type SystemPoint = { t: number; value: number | null };

/** One series of the history as chart points, the last `count` samples. */
export function toPoints(
  history: SystemHistory,
  series: Exclude<keyof SystemHistory, "t">,
  count: number,
): SystemPoint[] {
  const start = Math.max(0, history.t.length - count);

  return history.t.slice(start).map((t, index) => ({
    t,
    value: history[series][start + index] ?? null,
  }));
}
