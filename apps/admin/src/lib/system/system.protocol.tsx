import z from "zod";

/*
 * What `/admin/system` returns, shared by the admin server and the System
 * page. Pi-only readings are `null` off the booth, and `sources` says why.
 */

const bytesSchema = z.number().nonnegative();

export const systemThrottleFlagsSchema = z.object({
  underVoltage: z.boolean(),
  frequencyCapped: z.boolean(),
  throttled: z.boolean(),
  softTemperatureLimit: z.boolean(),
});

export const systemSourceSchema = z.object({
  state: z.enum(["available", "unavailable"]),
  /** For the page: where the reading comes from, or why there is none. */
  message: z.string(),
});

export const systemSampleSchema = z.object({
  /** When the Pi was read, by its own clock. */
  sampledAt: z.string(),
  hardware: z.object({
    /** The device tree's model string, e.g. "Raspberry Pi 5 Model B Rev 1.0". */
    model: z.string().nullable(),
    bootedAt: z.string(),
  }),
  thermal: z.object({
    celsius: z.number().nullable(),
    fanRpm: z.number().nullable(),
    cpuMhz: z.number().nullable(),
    throttle: z
      .object({
        now: systemThrottleFlagsSchema,
        sinceBoot: systemThrottleFlagsSchema,
      })
      .nullable(),
  }),
  memory: z.object({
    totalBytes: bytesSchema,
    /** `MemAvailable`: null off Linux, where only "free" exists and misleads. */
    availableBytes: bytesSchema.nullable(),
    /** Page cache and buffers: counted as available, shown apart. */
    cachedBytes: bytesSchema,
    swapTotalBytes: bytesSchema,
    swapUsedBytes: bytesSchema,
  }),
  cpu: z.object({
    cores: z.number().int().positive(),
    /** Load average over 1, 5 and 15 minutes. */
    load: z.tuple([z.number(), z.number(), z.number()]),
    /** Busy share since the previous sample; null on the first one. */
    usagePercent: z.number().nullable(),
  }),
  /** Only the mounts that exist on this machine. */
  disks: z.array(
    z.object({
      mount: z.string(),
      label: z.string(),
      totalBytes: bytesSchema,
      freeBytes: bytesSchema,
    }),
  ),
  sources: z.object({
    thermal: systemSourceSchema,
    fan: systemSourceSchema,
    throttle: systemSourceSchema,
    cpuFrequency: systemSourceSchema,
  }),
});

/** Parallel arrays, oldest first, one entry per sample. */
export const systemHistorySchema = z.object({
  /** Sample times, epoch ms by the Pi's clock. */
  t: z.array(z.number()),
  celsius: z.array(z.number().nullable()),
  availablePercent: z.array(z.number().nullable()),
  cpuPercent: z.array(z.number().nullable()),
});

export const systemSnapshotSchema = systemSampleSchema.extend({
  /** How old the latest sample is, by the server's clock: no skew. */
  ageMs: z.number().nonnegative(),
  history: systemHistorySchema,
});

export type SystemThrottleFlags = z.infer<typeof systemThrottleFlagsSchema>;
export type SystemSource = z.infer<typeof systemSourceSchema>;
export type SystemSample = z.infer<typeof systemSampleSchema>;
export type SystemHistory = z.infer<typeof systemHistorySchema>;
export type SystemSnapshot = z.infer<typeof systemSnapshotSchema>;
