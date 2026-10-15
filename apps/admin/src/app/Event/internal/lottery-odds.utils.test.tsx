import { describe, expect, test } from "bun:test";

import {
  computeOdds,
  forecastPrizes,
  formatDuration,
  formatOneIn,
  noWinWeightForChance,
  type OddsPrize,
} from "./lottery-odds.utils";

const prize = (overrides: Partial<OddsPrize> & { id: string }): OddsPrize => ({
  title: overrides.id,
  rarity: "common",
  weight: 1,
  remainingQuantity: 10,
  ...overrides,
});

describe("computeOdds", () => {
  test("matches the engine: weight / (no-win weight + prize weights)", () => {
    const odds = computeOdds({
      noWinWeight: 6,
      prizes: [
        prize({ id: "sticker", weight: 3 }),
        prize({ id: "drink", weight: 1, rarity: "legendary" }),
      ],
    });

    expect(odds.winChance).toBeCloseTo(0.4);
    expect(odds.byRarity).toEqual([
      { rarity: "legendary", chance: 0.1, remaining: 10 },
      { rarity: "common", chance: 0.3, remaining: 10 },
    ]);
    expect(odds.byPrize.map((entry) => entry.id)).toEqual(["drink", "sticker"]);
  });

  test("out-of-stock prizes leave the draw, as in the engine", () => {
    const odds = computeOdds({
      noWinWeight: 1,
      prizes: [
        prize({ id: "gone", remainingQuantity: 0, weight: 100 }),
        prize({ id: "left", weight: 1 }),
      ],
    });

    expect(odds.winChance).toBeCloseTo(0.5);
    expect(odds.byPrize.map((entry) => entry.id)).toEqual(["left"]);
  });

  test("no prizes means nobody wins", () => {
    expect(computeOdds({ noWinWeight: 5, prizes: [] }).winChance).toBe(0);
  });
});

describe("noWinWeightForChance", () => {
  test("is the inverse of the win chance", () => {
    const weight = noWinWeightForChance(0.25, 3);

    expect(weight).toBe(9);
    expect(
      computeOdds({
        noWinWeight: weight,
        prizes: [prize({ id: "a", weight: 3 })],
      }).winChance,
    ).toBeCloseTo(0.25);
  });

  test("a sure win needs no no-win weight", () => {
    expect(noWinWeightForChance(1, 3)).toBe(0);
  });
});

describe("formatOneIn", () => {
  test("reads like people talk about odds", () => {
    expect(formatOneIn(0.25)).toBe("1 in 4");
    expect(formatOneIn(0.3)).toBe("1 in 3.3");
    expect(formatOneIn(0.01)).toBe("1 in 100");
    expect(formatOneIn(0)).toBe("never");
    expect(formatOneIn(1)).toBe("every guest");
  });
});

describe("forecastPrizes", () => {
  const prizes = [prize({ id: "a", weight: 1, remainingQuantity: 10 })];

  test("without cooldown, wins per hour = guests per hour × win chance", () => {
    const forecast = forecastPrizes({
      prizes,
      noWinWeight: 3,
      cooldownMinutes: 0,
      guestsPerHour: 60,
    });

    expect(forecast.winsPerHour).toBeCloseTo(15);
    expect(forecast.cooldownCapPerHour).toBeNull();
    // 10 prizes at 15 per hour: gone in 40 minutes.
    expect(forecast.runsOutAfterMinutes).toBe(40);
  });

  test("the cooldown caps and slows the wins", () => {
    const forecast = forecastPrizes({
      prizes,
      noWinWeight: 0,
      cooldownMinutes: 10,
      guestsPerHour: 600,
    });

    // Everyone wins, but only one win per ~10 minutes.
    expect(forecast.cooldownCapPerHour).toBe(6);
    expect(forecast.winsPerHour).toBeLessThan(6);
    expect(forecast.winsPerHour).toBeGreaterThan(5.9);
  });

  test("stock that outlasts the horizon never runs out", () => {
    const forecast = forecastPrizes({
      prizes: [prize({ id: "a", weight: 1, remainingQuantity: 1000 })],
      noWinWeight: 99,
      cooldownMinutes: 0,
      guestsPerHour: 10,
    });

    expect(forecast.runsOutAfterMinutes).toBeNull();
    expect(forecast.points.at(-1)?.minute).toBe(12 * 60);
  });
});

describe("formatDuration", () => {
  test("formats minutes as hours and minutes", () => {
    expect(formatDuration(25)).toBe("25 min");
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(100)).toBe("1 h 40 min");
  });
});
