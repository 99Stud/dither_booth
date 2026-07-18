import type { Rarity } from "@dither-booth/shared/lottery";

export type EventLot = {
  id: string;
  title: string;
  winInstruction: string;
  weight: number;
  totalQuantity: number;
  remainingQuantity: number;
  rarity: Rarity;
};

export type CurrentEvent = {
  campaign: {
    id: string;
    name: string;
  };
  lottery: {
    id: string;
    enabled: boolean;
    noWinWeight: number;
    winCooldownMinutes: number;
    printLoserTicket: boolean;
  };
  lots: EventLot[];
};

export type EventTab = "overview" | "lottery" | "lots";

export type CreateEventFormValues = {
  name: string;
  noWinWeight: number;
  winCooldownMinutes: number;
  printLoserTicket: boolean;
  enabled: boolean;
};

export type UpdateEventNameFormValues = {
  name: string;
};

export type LotterySettingsFormValues = {
  enabled: boolean;
  noWinWeight: number;
  winCooldownMinutes: number;
  printLoserTicket: boolean;
};

export type LotFormValues = {
  title: string;
  winInstruction: string;
  weight: number;
  totalQuantity: number;
  remainingQuantity: number;
  rarity: Rarity;
};

export type RestockLotFormValues = {
  remainingQuantity: number;
  totalQuantity: number;
};
