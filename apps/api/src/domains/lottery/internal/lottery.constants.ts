import z from "zod";

export const API_LOTTERY_LOG_SOURCE = "api.lottery";

export const LOTTERY_CONFIG_SINGLETON_ID = 1;

export const LOTTERY_OUTCOME = {
  WIN: "win",
  LOSS: "loss",
  FORCED_LOSS: "forced_loss",
} as const;

export type LotteryOutcome =
  (typeof LOTTERY_OUTCOME)[keyof typeof LOTTERY_OUTCOME];

export const LOTTERY_RARITY = {
  COMMON: "common",
  MEDIUM: "medium",
  RARE: "rare",
  VERY_RARE: "very_rare",
} as const;

export type LotteryRarity =
  (typeof LOTTERY_RARITY)[keyof typeof LOTTERY_RARITY];

export const LOTTERY_RARITY_OPTIONS = Object.values(LOTTERY_RARITY);

export const CONFIGURE_LOTTERY_SCHEMA = z.object({
  enabled: z.boolean().optional().default(false),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Must be HH:MM format")
    .optional()
    .default("16:00"),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Must be HH:MM format")
    .optional()
    .default("21:00"),
  baseWinPressure: z.number().min(0).max(1).optional().default(0.15),
  maxBoost: z.number().min(1).max(10).optional().default(3),
  abuseWindowSeconds: z.number().int().min(5).max(300).optional().default(60),
  abuseMaxAttempts: z.number().int().min(2).max(50).optional().default(5),
  abuseMinIntervalSeconds: z
    .number()
    .int()
    .min(1)
    .max(60)
    .optional()
    .default(10),
  abuseCooldownSeconds: z
    .number()
    .int()
    .min(10)
    .max(600)
    .optional()
    .default(120),
});

export const CREATE_LOT_SCHEMA = z.object({
  label: z.string().min(1).max(100),
  stockTotal: z.number().int().min(1),
  baseWeight: z.number().min(0.01).max(100).default(1),
  rarity: z.enum(["common", "medium", "rare", "very_rare"]).default("common"),
  description: z.string().max(2000).optional().nullable(),
  instructions: z.string().max(2000).optional().nullable(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const UPDATE_LOT_SCHEMA = z.object({
  id: z.number().int(),
  label: z.string().min(1).max(100).optional(),
  stockTotal: z.number().int().min(1).optional(),
  stockRemaining: z.number().int().min(0).optional(),
  baseWeight: z.number().min(0.01).max(100).optional(),
  rarity: z.enum(["common", "medium", "rare", "very_rare"]).optional(),
  description: z.string().max(2000).optional().nullable(),
  instructions: z.string().max(2000).optional().nullable(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const LOTTERY_SIMULATION_PROFILE_SCHEMA = z.enum([
  "normal",
  "bursty",
  "mixed",
]);

export type LotterySimulationProfile = z.infer<
  typeof LOTTERY_SIMULATION_PROFILE_SCHEMA
>;

export const SIMULATE_LOTTERY_SCHEMA = z.object({
  attempts: z.number().int().min(10).max(20_000).default(500),
  samples: z.number().int().min(1).max(200).default(50),
  profile: LOTTERY_SIMULATION_PROFILE_SCHEMA.default("normal"),
});

export const TUNE_LOTTERY_SCHEMA = z.object({
  samples: z.number().int().min(1).max(25_000).default(4000),
  attempts: z.number().int().min(10).max(10_000).default(1000),
  seed: z.number().int().default(42),
});

export const SAVE_LOTTERY_PRESET_SCHEMA = z.object({
  name: z.string().min(1).max(80),
});

export const APPLY_LOTTERY_PRESET_SCHEMA = z.object({
  presetId: z.number().int().positive(),
});

export const GET_LOTTERY_EVENTS_SCHEMA = z.object({
  limit: z.number().int().min(1).max(500).default(200),
});
