import type { SelectFieldOption } from "@dither-booth/ui/fields/SelectField";

import { capitalize } from "@dither-booth/shared/formatting";
import {
  DEFAULT_KIT_ID,
  KIT_IDS,
  kitIdSchema,
} from "@dither-booth/shared/kits";
import { RARITY_TYPES } from "@dither-booth/shared/lottery";
import { ticketItemNamesSchema } from "@dither-booth/shared/ticket";
import z from "zod";

import type {
  CreateEventFormValues,
  EventPrize,
  PrizeFormValues,
  LotterySettingsFormValues,
  RestockPrizeFormValues,
  TicketItemsFormValues,
  UpdateEventFormValues,
} from "./Event.types";

export const EVENT_LOG_SOURCE = "admin.event";

export const CREATE_EVENT_FORM_SCHEMA = z.object({
  name: z.string().trim().min(1).max(120),
  kitId: kitIdSchema,
  noWinWeight: z.number().min(0),
  winCooldownMinutes: z.number().int().min(0),
  printLoserTicket: z.boolean(),
  enabled: z.boolean(),
});

export const UPDATE_EVENT_FORM_SCHEMA = z.object({
  name: z.string().trim().min(1).max(120),
  kitId: kitIdSchema,
});

export const TICKET_ITEMS_FORM_SCHEMA = z.object({
  names: ticketItemNamesSchema,
});

export const LOTTERY_SETTINGS_FORM_SCHEMA = z.object({
  enabled: z.boolean(),
  noWinWeight: z.number().min(0),
  winCooldownMinutes: z.number().int().min(0),
  printLoserTicket: z.boolean(),
});

/** Mirrors the engine's bound on a single stock change. */
const MAX_STOCK_CHANGE = 100_000;

/**
 * `quantity` is the initial stock and is only sent when creating a prize.
 * After that, stock only moves through restock deltas.
 */
export const PRIZE_FORM_SCHEMA = z.object({
  title: z.string().trim().min(1).max(120),
  winInstruction: z.string().trim().min(1).max(240),
  weight: z.number().gt(0),
  quantity: z.number().int().min(0).max(MAX_STOCK_CHANGE),
  rarity: z.enum(RARITY_TYPES),
});

/** Built per prize, so a removal can be checked against what is left. */
export const createRestockPrizeFormSchema = (remainingQuantity: number) =>
  z
    .object({
      delta: z.number().int().min(-MAX_STOCK_CHANGE).max(MAX_STOCK_CHANGE),
    })
    .refine((value) => value.delta !== 0, {
      message: "Enter how many to add, or a negative number to remove",
      path: ["delta"],
    })
    .refine((value) => remainingQuantity + value.delta >= 0, {
      message: `Only ${remainingQuantity} left to remove`,
      path: ["delta"],
    });

export const DEFAULT_RESTOCK_PRIZE_FORM_VALUES: RestockPrizeFormValues = {
  delta: 0,
};

export const DEFAULT_CREATE_EVENT_FORM_VALUES: CreateEventFormValues = {
  name: "",
  kitId: DEFAULT_KIT_ID,
  noWinWeight: 50,
  winCooldownMinutes: 5,
  printLoserTicket: false,
  enabled: false,
};

export const DEFAULT_PRIZE_FORM_VALUES: PrizeFormValues = {
  title: "",
  winInstruction: "Show this ticket at the bar",
  weight: 1,
  quantity: 1,
  rarity: "common",
};

/** The ticket kits this release ships, which decide how receipts look. */
export const KIT_FIELD_OPTIONS: Array<
  SelectFieldOption<UpdateEventFormValues["kitId"]>
> = KIT_IDS.map((kitId) => ({
  label: capitalize(kitId),
  value: kitId,
}));

export const getLotterySettingsFormValues = (event: {
  lottery: LotterySettingsFormValues;
}): LotterySettingsFormValues => ({
  enabled: event.lottery.enabled,
  noWinWeight: event.lottery.noWinWeight,
  winCooldownMinutes: event.lottery.winCooldownMinutes,
  printLoserTicket: event.lottery.printLoserTicket,
});

export const getUpdateEventFormValues = (event: {
  campaign: UpdateEventFormValues;
}): UpdateEventFormValues => ({
  name: event.campaign.name,
  kitId: event.campaign.kitId,
});

export const getTicketItemsFormValues = (event: {
  campaign: { ticketItemNames: string[] };
}): TicketItemsFormValues => ({
  names: [...event.campaign.ticketItemNames],
});

/** Edit form values. `quantity` is shown read-only and never sent. */
export const getPrizeFormValues = (prize: EventPrize): PrizeFormValues => ({
  title: prize.title,
  winInstruction: prize.winInstruction,
  weight: prize.weight,
  quantity: prize.remainingQuantity,
  rarity: prize.rarity,
});
