import { describe, expect, test } from "bun:test";

import { isWithinWinCooldown, runLotteryDraw } from "./lottery.engine";

const prizes = [
  {
    id: "prize-a",
    weight: 1,
    remainingQuantity: 1,
    rarity: "common" as const,
    title: "Prize A",
    winInstruction: "Show this ticket at the bar",
  },
  {
    id: "prize-b",
    weight: 1,
    remainingQuantity: 1,
    rarity: "rare" as const,
    title: "Prize B",
    winInstruction: "Show this ticket at the bar",
  },
];

describe("runLotteryDraw", () => {
  test("picks the first prize slice on a low roll", () => {
    const result = runLotteryDraw({ noWinWeight: 2, prizes, random: () => 0 });

    expect(result).toEqual({
      outcome: "win",
      prize: {
        id: "prize-a",
        rarity: "common",
        title: "Prize A",
        winInstruction: "Show this ticket at the bar",
      },
    });
  });

  test("picks the second prize slice on a mid roll", () => {
    // totalWeight = 4, roll = 0.3 * 4 = 1.2 -> lands in prize-b slice
    const result = runLotteryDraw({ noWinWeight: 2, prizes, random: () => 0.3 });

    expect(result).toEqual({
      outcome: "win",
      prize: {
        id: "prize-b",
        rarity: "rare",
        title: "Prize B",
        winInstruction: "Show this ticket at the bar",
      },
    });
  });

  test("lands on the no-win slice on a high roll", () => {
    // totalWeight = 4, roll = 0.9 * 4 = 3.6 -> beyond both prize slices
    const result = runLotteryDraw({ noWinWeight: 2, prizes, random: () => 0.9 });

    expect(result).toEqual({ outcome: "loss", prize: null });
  });

  test("excludes out-of-stock prizes", () => {
    const result = runLotteryDraw({
      noWinWeight: 0,
      prizes: [
        { ...prizes[0]!, remainingQuantity: 0 },
        { ...prizes[1]! },
      ],
      random: () => 0,
    });

    expect(result).toEqual({
      outcome: "win",
      prize: {
        id: "prize-b",
        rarity: "rare",
        title: "Prize B",
        winInstruction: "Show this ticket at the bar",
      },
    });
  });

  test("returns a loss when there are no eligible prizes", () => {
    const result = runLotteryDraw({
      noWinWeight: 1,
      prizes: [],
      random: () => 0,
    });

    expect(result).toEqual({ outcome: "loss", prize: null });
  });

  test("returns a loss when the total weight is zero", () => {
    const result = runLotteryDraw({
      noWinWeight: 0,
      prizes: [],
      random: () => 0,
    });

    expect(result).toEqual({ outcome: "loss", prize: null });
  });
});

describe("isWithinWinCooldown", () => {
  const now = new Date("2026-01-01T12:00:00.000Z");

  test("is false when there is no prior win", () => {
    expect(
      isWithinWinCooldown({ lastWinAt: null, now, winCooldownMinutes: 5 }),
    ).toBe(false);
  });

  test("is false when the cooldown is disabled (0 minutes)", () => {
    expect(
      isWithinWinCooldown({
        lastWinAt: new Date(now.getTime() - 60_000),
        now,
        winCooldownMinutes: 0,
      }),
    ).toBe(false);
  });

  test("is true just inside the cooldown window", () => {
    const lastWinAt = new Date(now.getTime() - 4 * 60_000);

    expect(
      isWithinWinCooldown({ lastWinAt, now, winCooldownMinutes: 5 }),
    ).toBe(true);
  });

  test("is false just outside the cooldown window", () => {
    const lastWinAt = new Date(now.getTime() - 6 * 60_000);

    expect(
      isWithinWinCooldown({ lastWinAt, now, winCooldownMinutes: 5 }),
    ).toBe(false);
  });

  test("is false exactly at the cooldown boundary", () => {
    const lastWinAt = new Date(now.getTime() - 5 * 60_000);

    expect(
      isWithinWinCooldown({ lastWinAt, now, winCooldownMinutes: 5 }),
    ).toBe(false);
  });
});
