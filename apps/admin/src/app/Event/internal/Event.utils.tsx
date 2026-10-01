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

export const getRemainingPrizes = (event: CurrentEvent) => {
  return event.prizes.reduce((sum, prize) => sum + prize.remainingQuantity, 0);
};

export const getRarityBreakdown = (event: CurrentEvent) => {
  const remainingByRarity = new Map<string, number>();

  for (const prize of event.prizes) {
    remainingByRarity.set(
      prize.rarity,
      (remainingByRarity.get(prize.rarity) ?? 0) + prize.remainingQuantity,
    );
  }

  return [...remainingByRarity.entries()]
    .filter(([, remaining]) => remaining > 0)
    .map(([rarity, remaining]) => ({ rarity, remaining }));
};
