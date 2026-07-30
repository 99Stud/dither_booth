import { raritySchema } from "@dither-booth/shared/lottery";
import z from "zod";

export const EVENT_LOG_SOURCE = "api.event";

export const createEventInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  noWinWeight: z.number().min(0).default(50),
  winCooldownMinutes: z.number().int().min(0).default(5),
  printLoserTicket: z.boolean().default(false),
  enabled: z.boolean().default(false),
});

export const updateEventInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const updateLotterySettingsInputSchema = z.object({
  enabled: z.boolean(),
  noWinWeight: z.number().min(0),
  winCooldownMinutes: z.number().int().min(0),
  printLoserTicket: z.boolean(),
});

export const createLotInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  winInstruction: z.string().trim().min(1).max(240),
  weight: z.number().gt(0),
  totalQuantity: z.number().int().min(0),
  remainingQuantity: z.number().int().min(0),
  rarity: raritySchema,
}).refine((value) => value.remainingQuantity <= value.totalQuantity, {
  message: "remainingQuantity must be <= totalQuantity",
  path: ["remainingQuantity"],
});

export const updateLotInputSchema = z
  .object({
    lotId: z.string().min(1),
    title: z.string().trim().min(1).max(120),
    winInstruction: z.string().trim().min(1).max(240),
    weight: z.number().gt(0),
    totalQuantity: z.number().int().min(0),
    remainingQuantity: z.number().int().min(0),
    rarity: raritySchema,
  })
  .refine((value) => value.remainingQuantity <= value.totalQuantity, {
    message: "remainingQuantity must be <= totalQuantity",
    path: ["remainingQuantity"],
  });

export const deleteLotInputSchema = z.object({
  lotId: z.string().min(1),
});

export const restockLotInputSchema = z
  .object({
    lotId: z.string().min(1),
    remainingQuantity: z.number().int().min(0),
    totalQuantity: z.number().int().min(0).optional(),
  })
  .refine(
    (value) =>
      value.totalQuantity === undefined ||
      value.remainingQuantity <= value.totalQuantity,
    {
      message: "remainingQuantity must be <= totalQuantity",
      path: ["remainingQuantity"],
    },
  );

export type CreateEventInput = z.infer<typeof createEventInputSchema>;
export type UpdateEventInput = z.infer<typeof updateEventInputSchema>;
export type UpdateLotterySettingsInput = z.infer<
  typeof updateLotterySettingsInputSchema
>;
export type CreateLotInput = z.infer<typeof createLotInputSchema>;
export type UpdateLotInput = z.infer<typeof updateLotInputSchema>;
export type DeleteLotInput = z.infer<typeof deleteLotInputSchema>;
export type RestockLotInput = z.infer<typeof restockLotInputSchema>;
