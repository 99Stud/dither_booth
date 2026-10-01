import type { DrawOutcome, Rarity } from "@dither-booth/shared/lottery";

export type EventPrize = {
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
  prizes: EventPrize[];
};

export type EventDraw = {
  id: string;
  ticketRef: string | null;
  createdAt: string;
  outcome: DrawOutcome;
  prizeTitle: string | null;
};

export type ListDrawsResult = {
  draws: EventDraw[];
};

/**
 * Future Appearance fields (logo, shader colors, photo template) belong on
 * campaign / a 1:1 event-config sibling — not on lottery. Lottery stays odds/stock.
 */
