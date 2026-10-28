import { afterEach, describe, expect, it } from "bun:test";

import { systemSnapshotSchema } from "./system.protocol";
import { createSystemReader } from "./system.reader";
import { createSystemRoute } from "./system.routes";
import { createSystemSampler } from "./system.sampler";
import { createPiDeps } from "./system.testing";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

describe("createSystemRoute", () => {
  it("serves the snapshot as JSON the page can parse, never cached", async () => {
    const sampler = createSystemSampler({
      reader: createSystemReader(createPiDeps()),
      intervalMs: 60_000,
    });

    cleanups.push(sampler.stop);

    const response = await createSystemRoute(sampler)(
      new Request("https://localhost:3002/admin/system"),
    );

    expect(response?.status).toBe(200);
    expect(response?.headers.get("cache-control")).toBe("no-store");

    const snapshot = systemSnapshotSchema.parse(await response?.json());

    expect(snapshot.thermal.celsius).toBe(61.2);
    expect(snapshot.history.t).toHaveLength(1);
  });

  it("answers 503 while there is nothing to show, and 405 to anything but GET", async () => {
    const sampler = createSystemSampler({
      reader: {
        sample: async () => {
          throw new Error("boom");
        },
      },
      intervalMs: 60_000,
    });

    cleanups.push(sampler.stop);

    const route = createSystemRoute(sampler);
    const failed = await route(
      new Request("https://localhost:3002/admin/system"),
    );

    expect(failed?.status).toBe(503);

    const rejected = await route(
      new Request("https://localhost:3002/admin/system", { method: "POST" }),
    );

    expect(rejected?.status).toBe(405);
  });
});
