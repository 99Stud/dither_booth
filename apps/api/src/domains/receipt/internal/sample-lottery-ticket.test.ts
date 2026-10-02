import { TRPCError } from "@trpc/server";
import { describe, expect, test } from "bun:test";

import { resolveSampleLotteryDraw } from "./sample-lottery-ticket";

const freeDrink = {
  id: "prize-1",
  rarity: "rare" as const,
  title: "Free drink",
  winInstruction: "Show this at the bar.",
};

const sticker = {
  id: "prize-2",
  rarity: "common" as const,
  title: "Sticker",
  winInstruction: "Pick one at the counter.",
};

describe("resolveSampleLotteryDraw", () => {
  test("builds a loss without attaching a prize", () => {
    expect(
      resolveSampleLotteryDraw({
        outcome: "loss",
        prizes: [freeDrink],
      }),
    ).toEqual({ outcome: "loss", prize: null });
  });

  test("builds a win for the requested prize", () => {
    expect(
      resolveSampleLotteryDraw({
        outcome: "win",
        prizeId: "prize-2",
        prizes: [freeDrink, sticker],
      }),
    ).toEqual({
      outcome: "win",
      prize: {
        id: sticker.id,
        rarity: sticker.rarity,
        title: sticker.title,
        winInstruction: sticker.winInstruction,
      },
    });
  });

  test("uses the first prize when none is selected", () => {
    expect(
      resolveSampleLotteryDraw({
        outcome: "win",
        prizes: [freeDrink, sticker],
      }).prize?.id,
    ).toBe(freeDrink.id);
  });

  test("rejects a win when the event has no prizes", () => {
    expect(() =>
      resolveSampleLotteryDraw({ outcome: "win", prizes: [] }),
    ).toThrow(TRPCError);
  });

  test("rejects a win for a prize that is not on the event", () => {
    expect(() =>
      resolveSampleLotteryDraw({
        outcome: "win",
        prizeId: "missing",
        prizes: [freeDrink],
      }),
    ).toThrow(TRPCError);
  });
});
