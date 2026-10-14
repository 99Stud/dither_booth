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
const quantitySchema = z.number().int().min(0);

const remainingWithinTotal = <
  TSchema extends z.ZodType<{
    remainingQuantity: number;
    totalQuantity?: number;
  }>,
>(
  schema: TSchema,
) =>
  schema.refine(
    (value) =>
      value.totalQuantity === undefined ||
      value.remainingQuantity <= value.totalQuantity,
    {
      message: "remainingQuantity must be <= totalQuantity",
      path: ["remainingQuantity"],
    },
  );

const prizeFieldsSchema = z.object({
  title: z.string().trim().min(1).max(120),
  winInstruction: z.string().trim().min(1).max(240),
  weight: z.number().gt(0),
  totalQuantity: quantitySchema,
  remainingQuantity: quantitySchema,
  rarity: raritySchema,
});

/**
 * Stock the admin saw when opening the form. Kiosk wins keep decrementing
 * `remainingQuantity`, so writes that set it absolutely are rejected with
 * `CONFLICT` when it moved underneath the form.
 */
const expectedRemainingQuantitySchema = quantitySchema;

export const createPrizeInputSchema = remainingWithinTotal(prizeFieldsSchema);

export const updatePrizeInputSchema = remainingWithinTotal(
  prizeFieldsSchema.extend({
    prizeId: prizeIdSchema,
    expectedRemainingQuantity: expectedRemainingQuantitySchema,
  }),
);

export const deletePrizeInputSchema = z.object({
  prizeId: prizeIdSchema,
});

export const restockPrizeInputSchema = remainingWithinTotal(
  z.object({
    prizeId: prizeIdSchema,
    remainingQuantity: quantitySchema,
    totalQuantity: quantitySchema.optional(),
    expectedRemainingQuantity: expectedRemainingQuantitySchema,
  }),
);

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
