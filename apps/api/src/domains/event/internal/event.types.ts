import type { Rarity } from "@dither-booth/shared/lottery";

export type EventLot = {
  id: string;
  winDescription: string;
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

/**
 * Future Appearance fields (logo, shader colors, photo template) belong on
 * campaign / a 1:1 event-config sibling — not on lottery. Lottery stays odds/stock.
 */
