/*
 * Shared by the admin server and the System page: keep this file free of
 * server-only imports.
 */

/** The System page's JSON route on the admin server. */
export const SYSTEM_ROUTE_PATH = "/admin/system";

/** The System page's route in the admin. */
export const SYSTEM_PAGE_PATH = "/system";

/** How often the admin server reads the Pi. */
export const SYSTEM_SAMPLE_INTERVAL_MS = 5_000;

/** Samples kept for the charts: one hour at the sampling interval. */
export const SYSTEM_HISTORY_SAMPLES = 720;

/** The shorter chart range, in samples: 15 minutes. */
export const SYSTEM_RECENT_SAMPLES = 180;

/** A snapshot older than this is shown as not updating. */
export const SYSTEM_STALE_AFTER_MS = SYSTEM_SAMPLE_INTERVAL_MS * 3;

/** Warm: worth a look before the room gets hotter. */
export const SYSTEM_TEMPERATURE_WARNING_C = 70;
/** Where the Pi 5's firmware starts lowering the clock. */
export const SYSTEM_TEMPERATURE_CRITICAL_C = 80;
/** The gauge's end: the Pi 5's hard throttle temperature. */
export const SYSTEM_TEMPERATURE_GAUGE_MAX_C = 85;

/** Free memory or disk below this share is worth a look. */
export const SYSTEM_FREE_WARNING_PERCENT = 15;
/** Below this, the booth is about to fail. */
export const SYSTEM_FREE_CRITICAL_PERCENT = 5;

/**
 * The disks staff care about: the microSD the Pi boots from and the SSD
 * that holds the data (`SSD_MOUNT_POINT` in the CLI).
 */
export const SYSTEM_DISKS = [
  { mount: "/", label: "microSD" },
  { mount: "/mnt/ssd", label: "SSD" },
] as const;

/**
 * `vcgencmd get_throttled` bits. Each flag has a "now" bit and, 16 higher,
 * a "since boot" bit that stays set until the Pi restarts.
 */
export const SYSTEM_THROTTLE_FLAGS = [
  {
    key: "underVoltage",
    bit: 0,
    label: "Under-voltage",
    description:
      "The supply voltage dropped too low. Use the official 27 W supply.",
  },
  {
    key: "frequencyCapped",
    bit: 1,
    label: "Clock capped",
    description: "The firmware capped the CPU clock, from heat or power.",
  },
  {
    key: "throttled",
    bit: 2,
    label: "Throttled",
    description: "The CPU ran slower than it could, from heat or power.",
  },
  {
    key: "softTemperatureLimit",
    bit: 3,
    label: "Soft temperature limit",
    description:
      "The SoC passed its soft limit and the clock was lowered to cool it.",
  },
] as const;

export type SystemThrottleFlagKey =
  (typeof SYSTEM_THROTTLE_FLAGS)[number]["key"];
