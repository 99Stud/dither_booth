import { describe, expect, it } from "bun:test";

import { router } from "#internal/trpc.ts";

import { simulateLottery } from "./simulate-lottery.ts";

const createCaller = () => {
  return router({ simulateLottery }).createCaller({
    db: undefined as never,
  });
};

describe("simulateLottery", () => {
  it("returns Monte Carlo aggregate summaries when samples > 1", async () => {
    const result = await createCaller().simulateLottery({
      attempts: 25,
      profile: "normal",
      samples: 5,
    } as never);

    expect(result.samples).toBe(5);
    expect(result.wins).toMatchObject({
      mean: expect.any(Number),
      p50: expect.any(Number),
      p90: expect.any(Number),
    });
    expect(result.effectiveWinRate).toMatchObject({
      mean: expect.any(Number),
      p10: expect.any(Number),
      p90: expect.any(Number),
    });
    expect(result.probCurve[0]).toMatchObject({
      elapsedPct: expect.any(Number),
      pPct: expect.objectContaining({
        mean: expect.any(Number),
        p10: expect.any(Number),
        p90: expect.any(Number),
      }),
      stockPct: expect.objectContaining({
        mean: expect.any(Number),
        p10: expect.any(Number),
        p90: expect.any(Number),
      }),
    });
  });
});
