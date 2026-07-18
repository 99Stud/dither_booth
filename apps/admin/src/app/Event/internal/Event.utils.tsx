import { reportKioskError } from "#lib/logging/logging.utils";

import type { CurrentEvent } from "./Event.types";

import { EVENT_LOG_SOURCE } from "./Event.constants";

export const reportEventError = (
  error: unknown,
  event: string,
  userMessage: string,
) => {
  return reportKioskError(error, {
    event,
    source: EVENT_LOG_SOURCE,
    userMessage,
  });
};

export const getRemainingLots = (event: CurrentEvent) => {
  return event.lots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
};

export const getRarityBreakdown = (event: CurrentEvent) => {
  const remainingByRarity = new Map<string, number>();

  for (const lot of event.lots) {
    remainingByRarity.set(
      lot.rarity,
      (remainingByRarity.get(lot.rarity) ?? 0) + lot.remainingQuantity,
    );
  }

  return [...remainingByRarity.entries()]
    .filter(([, remaining]) => remaining > 0)
    .map(([rarity, remaining]) => ({ rarity, remaining }));
};
