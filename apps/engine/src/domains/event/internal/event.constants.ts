import { raritySchema } from "@dither-booth/shared/lottery";
import { ticketItemNamesSchema } from "@dither-booth/shared/ticket";
import z from "zod";

export const EVENT_LOG_SOURCE = "engine.event";

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

export const updateTicketItemsInputSchema = z.object({
  names: ticketItemNamesSchema,
});

export const updateLotterySettingsInputSchema = z.object({
  enabled: z.boolean(),
  noWinWeight: z.number().min(0),
  winCooldownMinutes: z.number().int().min(0),
  printLoserTicket: z.boolean(),
});

const prizeIdSchema = z.string().min(1);

/** Upper bound for one stock change, far above any real event. */
export const MAX_STOCK_CHANGE = 100_000;

const prizeFieldsSchema = z.object({
  title: z.string().trim().min(1).max(120),
  winInstruction: z.string().trim().min(1).max(240),
  weight: z.number().gt(0),
  rarity: raritySchema,
});

export const createPrizeInputSchema = prizeFieldsSchema.extend({
  /** Initial stock, recorded as the prize's first ledger entry. */
  quantity: z.number().int().min(0).max(MAX_STOCK_CHANGE),
});

export const updatePrizeInputSchema = prizeFieldsSchema.extend({
  prizeId: prizeIdSchema,
});

export const deletePrizeInputSchema = z.object({
  prizeId: prizeIdSchema,
});

export const restockPrizeInputSchema = z.object({
  prizeId: prizeIdSchema,
  /** Stock to add (positive) or remove (negative). */
  delta: z
    .number()
    .int()
    .min(-MAX_STOCK_CHANGE)
    .max(MAX_STOCK_CHANGE)
    .refine((delta) => delta !== 0, "A stock change cannot be zero."),
  /**
   * Chosen by the caller when the change is first requested and reused on
   * every retry, so the same change is never applied twice.
   */
  adjustmentId: z.cuid2(),
});

export const listDrawsInputSchema = z.object({
  ticketRef: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export type CreateEventInput = z.infer<typeof createEventInputSchema>;
export type UpdateEventInput = z.infer<typeof updateEventInputSchema>;
export type UpdateTicketItemsInput = z.infer<
  typeof updateTicketItemsInputSchema
>;
export type UpdateLotterySettingsInput = z.infer<
  typeof updateLotterySettingsInputSchema
>;
export type CreatePrizeInput = z.infer<typeof createPrizeInputSchema>;
export type UpdatePrizeInput = z.infer<typeof updatePrizeInputSchema>;
export type DeletePrizeInput = z.infer<typeof deletePrizeInputSchema>;
export type RestockPrizeInput = z.infer<typeof restockPrizeInputSchema>;
export type ListDrawsInput = z.infer<typeof listDrawsInputSchema>;
