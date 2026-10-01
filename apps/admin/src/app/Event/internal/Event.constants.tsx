import type { SelectFieldOption } from "@dither-booth/ui/fields/SelectField";

import { capitalize } from "@dither-booth/shared/formatting";
import { RARITY_TYPES } from "@dither-booth/shared/lottery";
import z from "zod";

import type {
  CreateEventFormValues,
  EventTab,
  PrizeFormValues,
  LotterySettingsFormValues,
  RestockPrizeFormValues,
  UpdateEventNameFormValues,
} from "./Event.types";

export const EVENT_LOG_SOURCE = "admin.event";

export const EVENT_TABS = [
  "overview",
  "lottery",
  "prizes",
  "draws",
] as const satisfies ReadonlyArray<EventTab>;

export const CREATE_EVENT_FORM_SCHEMA = z.object({
  name: z.string().trim().min(1).max(120),
  noWinWeight: z.number().min(0),
  winCooldownMinutes: z.number().int().min(0),
  printLoserTicket: z.boolean(),
  enabled: z.boolean(),
});

export const UPDATE_EVENT_NAME_FORM_SCHEMA = z.object({
  name: z.string().trim().min(1).max(120),
});

export const LOTTERY_SETTINGS_FORM_SCHEMA = z.object({
  enabled: z.boolean(),
  noWinWeight: z.number().min(0),
  winCooldownMinutes: z.number().int().min(0),
  printLoserTicket: z.boolean(),
});

export const PRIZE_FORM_SCHEMA = z
  .object({
    title: z.string().trim().min(1).max(120),
    winInstruction: z.string().trim().min(1).max(240),
    weight: z.number().gt(0),
    totalQuantity: z.number().int().min(0),
    remainingQuantity: z.number().int().min(0),
    rarity: z.enum(RARITY_TYPES),
  })
  .refine((value) => value.remainingQuantity <= value.totalQuantity, {
    message: "Remaining cannot exceed total",
    path: ["remainingQuantity"],
  });

export const RESTOCK_PRIZE_FORM_SCHEMA = z
  .object({
    remainingQuantity: z.number().int().min(0),
    totalQuantity: z.number().int().min(0),
  })
  .refine((value) => value.remainingQuantity <= value.totalQuantity, {
    message: "Remaining cannot exceed total",
    path: ["remainingQuantity"],
  });

export const DEFAULT_CREATE_EVENT_FORM_VALUES: CreateEventFormValues = {
  name: "",
  noWinWeight: 50,
  winCooldownMinutes: 5,
  printLoserTicket: false,
  enabled: false,
};

export const DEFAULT_PRIZE_FORM_VALUES: PrizeFormValues = {
  title: "",
  winInstruction: "Show this ticket at the bar",
  weight: 1,
  totalQuantity: 1,
  remainingQuantity: 1,
  rarity: "common",
};

export const RARITY_FIELD_OPTIONS: Array<
  SelectFieldOption<PrizeFormValues["rarity"]>
> = RARITY_TYPES.map((rarity) => ({
  label: capitalize(rarity),
  value: rarity,
}));

export const getLotterySettingsFormValues = (event: {
  lottery: LotterySettingsFormValues;
}): LotterySettingsFormValues => ({
  enabled: event.lottery.enabled,
  noWinWeight: event.lottery.noWinWeight,
  winCooldownMinutes: event.lottery.winCooldownMinutes,
  printLoserTicket: event.lottery.printLoserTicket,
});

export const getUpdateEventNameFormValues = (event: {
  campaign: { name: string };
}): UpdateEventNameFormValues => ({
  name: event.campaign.name,
});

export const getPrizeFormValues = (
  prize: PrizeFormValues,
): PrizeFormValues => ({
  title: prize.title,
  winInstruction: prize.winInstruction,
  weight: prize.weight,
  totalQuantity: prize.totalQuantity,
  remainingQuantity: prize.remainingQuantity,
  rarity: prize.rarity,
});

export const getRestockPrizeFormValues = (prize: {
  remainingQuantity: number;
  totalQuantity: number;
}): RestockPrizeFormValues => ({
  remainingQuantity: prize.remainingQuantity,
  totalQuantity: prize.totalQuantity,
});
