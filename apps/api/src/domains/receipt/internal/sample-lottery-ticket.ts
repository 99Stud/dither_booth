import type {
  DrawOutcome,
  DrawResult,
  Rarity,
} from "@dither-booth/shared/lottery";

import { TRPCError } from "@trpc/server";

/** Printed on sample tickets so a preview cannot be mistaken for a real draw. */
export const SAMPLE_LOTTERY_TICKET_REF = "000000";

type SampleLotteryPrize = {
  id: string;
  rarity: Rarity;
  title: string;
  winInstruction: string;
};

export const resolveSampleLotteryDraw = (input: {
  outcome: DrawOutcome;
  prizeId?: string;
  prizes: SampleLotteryPrize[];
}): DrawResult => {
  const { outcome, prizeId, prizes } = input;

  if (outcome === "loss") {
    return { outcome: "loss", prize: null };
  }

  const prize =
    prizes.find((item) => item.id === prizeId) ??
    (prizeId ? undefined : prizes[0]);

  if (!prize) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: prizeId
        ? "Prize not found on the current event."
        : "Add a prize before printing a win ticket.",
    });
  }

  return {
    outcome: "win",
    prize: {
      id: prize.id,
      rarity: prize.rarity,
      title: prize.title,
      winInstruction: prize.winInstruction,
    },
  };
};
