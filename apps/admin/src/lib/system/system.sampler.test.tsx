import { afterEach, describe, expect, it } from "bun:test";

import type { SystemReader } from "./system.reader";

import { createSystemReader } from "./system.reader";
import { SystemNotSampledError, createSystemSampler } from "./system.sampler";
import { FAKE_NOW, createPiDeps } from "./system.testing";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("createSystemSampler", () => {
  it("has a snapshot after the first read and keeps at most `capacity` samples", async () => {
    let clock = FAKE_NOW;
    const reader = createSystemReader(createPiDeps({ now: () => clock }));
    const sampler = createSystemSampler({
      reader,
      intervalMs: 5,
      capacity: 3,
      now: () => clock,
    });

    cleanups.push(sampler.stop);

    const first = await sampler.snapshot();

    expect(first.history.t).toEqual([FAKE_NOW]);
    expect(first.history.celsius).toEqual([61.2]);
    expect(first.history.availablePercent).toEqual([63.4]);
    expect(first.history.cpuPercent).toEqual([null]);
    expect(first.ageMs).toBe(0);

    clock += 1_000;

    expect((await sampler.snapshot()).ageMs).toBe(1_000);

    await sleep(60);

    const later = await sampler.snapshot();

    expect(later.history.t.length).toBe(3);
    expect(later.history.celsius.length).toBe(3);
    expect(later.history.availablePercent.length).toBe(3);
    expect(later.history.cpuPercent.length).toBe(3);
  });

  it("keeps the last good sample through a failed read, and its age grows", async () => {
    let clock = FAKE_NOW;
    let fail = false;
    const errors: unknown[] = [];
    const piReader = createSystemReader(createPiDeps({ now: () => clock }));
    const reader: SystemReader = {
      sample: () => {
        if (fail) {
          throw new Error("vcgencmd hung");
        }

        return piReader.sample();
      },
    };
    const sampler = createSystemSampler({
      reader,
      intervalMs: 5,
      now: () => clock,
      onError: (error) => errors.push(error),
    });

    cleanups.push(sampler.stop);

    const first = await sampler.snapshot();

    fail = true;
    clock += 20_000;
    await sleep(30);

    const later = await sampler.snapshot();

    expect(errors.length).toBeGreaterThan(0);
    expect(later.sampledAt).toBe(first.sampledAt);
    expect(later.history.t).toEqual(first.history.t);
    expect(later.ageMs).toBe(20_000);
  });

  it("throws until a read succeeds, and reports the failure", async () => {
    const errors: unknown[] = [];
    const reader: SystemReader = {
      sample: async () => {
        throw new Error("boom");
      },
    };
    const sampler = createSystemSampler({
      reader,
      intervalMs: 60_000,
      onError: (error) => errors.push(error),
    });

    cleanups.push(sampler.stop);

    await expect(sampler.snapshot()).rejects.toBeInstanceOf(
      SystemNotSampledError,
    );
    expect(errors).toHaveLength(1);
  });
});
