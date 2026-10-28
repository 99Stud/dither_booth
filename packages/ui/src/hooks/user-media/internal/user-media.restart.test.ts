/// <reference types="bun" />

import { describe, expect, it } from "bun:test";

import { createRestartBudget } from "./user-media.restart";

const tick = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe("createRestartBudget", () => {
  it("allows the limit in a row, then refuses", () => {
    const budget = createRestartBudget({ limit: 3, stableMs: 1000 });

    expect([budget.take(), budget.take(), budget.take()]).toEqual([
      true,
      true,
      true,
    ]);
    expect(budget.take()).toBe(false);
    expect(budget.take()).toBe(false);

    budget.dispose();
  });

  it("runs out for a camera that draws a frame and dies right after", () => {
    const budget = createRestartBudget({ limit: 3, stableMs: 1000 });
    const decisions: boolean[] = [];

    // Each reopen shows one frame, then the track ends at once.
    for (let attempt = 0; attempt < 5; attempt++) {
      budget.pictureShown();
      decisions.push(budget.take());
    }

    expect(decisions).toEqual([true, true, true, false, false]);

    budget.dispose();
  });

  it("gives the restarts back once a picture has lasted", async () => {
    const budget = createRestartBudget({ limit: 2, stableMs: 10 });

    budget.take();
    budget.take();
    budget.pictureShown();
    await tick(30);

    expect(budget.take()).toBe(true);
    expect(budget.take()).toBe(true);
    expect(budget.take()).toBe(false);

    budget.dispose();
  });

  it("never refills after dispose", async () => {
    const budget = createRestartBudget({ limit: 1, stableMs: 10 });

    budget.take();
    budget.pictureShown();
    budget.dispose();
    await tick(30);

    expect(budget.take()).toBe(false);
  });
});
