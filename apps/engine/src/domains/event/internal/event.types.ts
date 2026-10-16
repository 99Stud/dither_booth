import type { KitId, KitSettings } from "@dither-booth/shared/kits";
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
    /** The kit this release renders for the event, after any fallback. */
    kitId: KitId;
    /** What the event changes on its kit, minus anything this release can't use. */
    kitSettings: KitSettings;
    ticketItemNames: string[];
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

export type ReceiptEventSettings = {
  kitId: KitId;
  ticketItems: string[];
};

/**
 * Appearance (copy, and later fonts and the shader) lives on the campaign as
 * `kit_settings`, next to `kit_id` — not on lottery. Lottery stays
 * odds/stock.
 */
