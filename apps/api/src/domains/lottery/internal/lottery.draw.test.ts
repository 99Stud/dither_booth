import { describe, expect, mock, test } from "bun:test";

import type { DB } from "#db/internal/db.types";

import { executeLotteryDraw } from "./lottery.draw";

function createForceDb({
  prize,
}: {
  prize?: {
    id: string;
    lotteryId: string;
    rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
    remainingQuantity: number;
    title: string;
    winInstruction: string;
  } | null;
}) {
  const inserts: Array<{ lotteryId: string | null; prizeId: string | null }> =
    [];

  const db = {
    insert: mock(() => ({
      values: mock(
        async (values: {
          lotteryId: string | null;
          prizeId: string | null;
        }) => {
          inserts.push(values);
        },
      ),
    })),
    query: {
      lotteryTable: {
        findFirst: mock(async () =>
          prize
            ? {
                id: prize.lotteryId,
                enabled: true,
                noWinWeight: 1,
                winCooldownMinutes: 0,
              }
            : {
                id: "lottery-1",
                enabled: true,
                noWinWeight: 1,
                winCooldownMinutes: 0,
              },
        ),
      },
      prizeTable: {
        findFirst: mock(async () => prize ?? null),
        findMany: mock(async () => []),
      },
      drawTable: {
        findFirst: mock(async () => null),
      },
    },
    transaction: mock(() => {
      throw new Error("transaction should not run for forced draws");
    }),
  };

  return {
    db: db as unknown as DB,
    getInserts: () => inserts,
  };
}

describe("executeLotteryDraw force path", () => {
  test("forces a loss without running the weighted draw", async () => {
    const { db, getInserts } = createForceDb({});

    const result = await executeLotteryDraw({
      db,
      force: { outcome: "loss" },
    });

    expect(result).toEqual({ outcome: "loss", prize: null });
    expect(getInserts()).toEqual([{ lotteryId: "lottery-1", prizeId: null }]);
  });

  test("forces a win for a prize id without decrementing stock", async () => {
    const prize = {
      id: "prize-1",
      lotteryId: "lottery-1",
      rarity: "rare" as const,
      remainingQuantity: 3,
      title: "Sticker pack",
      winInstruction: "Show this ticket at the bar",
    };
    const { db, getInserts } = createForceDb({ prize });

    const result = await executeLotteryDraw({
      db,
      force: { outcome: "win", prizeId: prize.id },
    });

    expect(result).toEqual({
      outcome: "win",
      prize: {
        id: "prize-1",
        rarity: "rare",
        title: "Sticker pack",
        winInstruction: "Show this ticket at the bar",
      },
    });
    expect(getInserts()).toEqual([
      { lotteryId: "lottery-1", prizeId: "prize-1" },
    ]);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  test("throws when forced prize id is missing", async () => {
    const { db } = createForceDb({ prize: null });

    await expect(
      executeLotteryDraw({
        db,
        force: { outcome: "win", prizeId: "missing-prize" },
      }),
    ).rejects.toThrow(/Forced lottery prize not found/);
  });
});
