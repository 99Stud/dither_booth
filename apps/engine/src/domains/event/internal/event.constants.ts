import {
  DEFAULT_KIT_ID,
  kitIdSchema,
  kitSettingsSchema,
} from "@dither-booth/shared/kits";
import { raritySchema } from "@dither-booth/shared/lottery";
import { ticketItemNamesSchema } from "@dither-booth/shared/ticket";
import z from "zod";

export const EVENT_LOG_SOURCE = "engine.event";

const eventTimeSchema = z.iso.datetime({ offset: true }).nullable();

/** An event can't end before it starts; either side may be left open. */
const endsAfterStart = (startEnd: {
  startsAt: string | null;
  endsAt: string | null;
}) =>
  startEnd.startsAt === null ||
  startEnd.endsAt === null ||
  new Date(startEnd.endsAt) > new Date(startEnd.startsAt);

const END_BEFORE_START = {
  message: "The event has to end after it starts.",
  path: ["endsAt"],
};

export const createEventInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    kitId: kitIdSchema.default(DEFAULT_KIT_ID),
    noWinWeight: z.number().min(0).default(50),
    winCooldownMinutes: z.number().int().min(0).default(5),
    printLoserTicket: z.boolean().default(false),
    enabled: z.boolean().default(false),
    startsAt: eventTimeSchema.default(null),
    endsAt: eventTimeSchema.default(null),
  })
  .refine(endsAfterStart, END_BEFORE_START);

/** The event's details. Times are always sent, so a rename can't drop them. */
export const updateEventInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    startsAt: eventTimeSchema,
    endsAt: eventTimeSchema,
  })
  .refine(endsAfterStart, END_BEFORE_START);

/** The kit and what the event changes on it, saved together. */
export const updateKitSettingsInputSchema = z.object({
  kitId: kitIdSchema,
  settings: kitSettingsSchema,
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

/** Times are optional here: an event created without them is open. */
export type CreateEventInput = z.input<typeof createEventInputSchema> &
  Omit<z.infer<typeof createEventInputSchema>, "startsAt" | "endsAt">;
export type UpdateEventInput = z.infer<typeof updateEventInputSchema>;
export type UpdateKitSettingsInput = z.infer<
  typeof updateKitSettingsInputSchema
>;
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
