import { TRPCClientError } from "@trpc/client";

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

/**
 * The API rejects a prize edit or restock with CONFLICT when a kiosk win moved
 * the stock after the form opened, so the form's numbers are stale.
 */
export const isStockConflictError = (error: unknown) => {
  return error instanceof TRPCClientError && error.data?.code === "CONFLICT";
};
